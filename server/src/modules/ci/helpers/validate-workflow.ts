/**
 * Validation of a (possibly user-edited) workflow before it is exported
 * (AC-11). Pure, I/O-free by hand. Wider validation is deferred (spec).
 */
import { parse } from 'yaml';

export type WorkflowViolation = 'yaml_parse_error' | 'pull_request_target' | 'permission_not_allowed';

export type WorkflowValidation = { ok: true } | { ok: false; reason: WorkflowViolation };

const PULL_REQUEST_TARGET = 'pull_request_target';

/** Token scopes the generated workflow may request, and the values each allows. */
const ALLOWED_SCOPES: Record<string, readonly string[]> = {
  contents: ['read', 'none'],
  'pull-requests': ['read', 'write', 'none'],
};

function isMapping(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `pull_request_target` as a key at any depth. */
function hasTargetKey(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasTargetKey);
  if (!isMapping(node)) return false;
  return Object.entries(node).some(([k, v]) => k === PULL_REQUEST_TARGET || hasTargetKey(v));
}

/** `on: pull_request_target` and `on: [push, pull_request_target]`. */
function onNamesTarget(on: unknown): boolean {
  if (typeof on === 'string') return on === PULL_REQUEST_TARGET;
  if (Array.isArray(on)) return on.some((e) => e === PULL_REQUEST_TARGET);
  return false;
}

/** True when a `permissions:` value asks for more than the allowed scopes. */
function permissionsExceed(perms: unknown): boolean {
  // `write-all` / `read-all` strings, a null block, or any other scalar.
  if (!isMapping(perms)) return true;
  return Object.entries(perms).some(([scope, value]) => {
    const allowed = ALLOWED_SCOPES[scope];
    if (allowed) return typeof value !== 'string' || !allowed.includes(value);
    return value !== 'none';
  });
}

/** A YAML merge key (`<<`) at any depth — it can smuggle a permissions block past the checks. */
function hasMergeKey(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasMergeKey);
  if (!isMapping(node)) return false;
  return Object.entries(node).some(([k, v]) => k === '<<' || hasMergeKey(v));
}

export function validateWorkflow(text: string): WorkflowValidation {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch {
    return { ok: false, reason: 'yaml_parse_error' };
  }
  if (!isMapping(doc)) return { ok: false, reason: 'yaml_parse_error' };

  if (hasTargetKey(doc) || onNamesTarget(doc.on)) {
    return { ok: false, reason: PULL_REQUEST_TARGET };
  }

  // A merge key is read by `parse` as a literal `<<` key only when merging is off;
  // either way it is rejected rather than resolved.
  if (hasMergeKey(doc) || /^\s*<<\s*:/m.test(text)) {
    return { ok: false, reason: 'permission_not_allowed' };
  }
  // The top-level block is required: without it the token falls back to the repo default.
  if (!('permissions' in doc) || permissionsExceed(doc.permissions)) {
    return { ok: false, reason: 'permission_not_allowed' };
  }
  const jobs = doc.jobs;
  if (isMapping(jobs)) {
    for (const job of Object.values(jobs)) {
      if (isMapping(job) && 'permissions' in job && permissionsExceed(job.permissions)) {
        return { ok: false, reason: 'permission_not_allowed' };
      }
    }
  }
  return { ok: true };
}
