import type { CiFile, CiPostAs, CiTrigger } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import {
  ERR_PROVIDER_NOT_SUPPORTED,
  ERR_WORKFLOW_INVALID,
  LOCKED_TRIGGER,
  POST_AS_VALUES,
  TRIGGER_VALUES,
} from "./constants";

/** What the wizard opens with: all optional — the active repo and the defaults fill the gaps. */
export interface WizardInitial {
  repoId?: string;
  triggers?: readonly CiTrigger[];
  postAs?: CiPostAs;
}

/** Triggers in canonical order, `synchronize` always present, no duplicates. */
export function normalizeTriggers(triggers: readonly CiTrigger[]): CiTrigger[] {
  const wanted = new Set<CiTrigger>([...triggers, LOCKED_TRIGGER]);
  return TRIGGER_VALUES.filter((t) => wanted.has(t));
}

/** Flips one trigger; the locked one never changes. */
export function toggleTrigger(triggers: readonly CiTrigger[], trigger: CiTrigger): CiTrigger[] {
  if (trigger === LOCKED_TRIGGER) return normalizeTriggers(triggers);
  return normalizeTriggers(
    triggers.includes(trigger) ? triggers.filter((t) => t !== trigger) : [...triggers, trigger],
  );
}

/** The option an Arrow key moves to from `current` (wraps; Down/Right = next). */
export function stepPostAs(current: CiPostAs, key: string): CiPostAs | null {
  const forward = key === "ArrowDown" || key === "ArrowRight";
  const backward = key === "ArrowUp" || key === "ArrowLeft";
  if (!forward && !backward) return null;
  const n = POST_AS_VALUES.length;
  const i = POST_AS_VALUES.indexOf(current);
  return POST_AS_VALUES[(i + (forward ? 1 : n - 1)) % n] ?? null;
}

/** The workflow is the one editable file of a preview. */
export function workflowOf(files: readonly CiFile[]): CiFile | undefined {
  return files.find((f) => f.editable);
}

/** "812 B", "12.3 KB", "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The wording of a failed preview or export. Server messages (github_error,
 * slug_conflict, runner_bundle_missing) already name what went wrong, so they
 * are shown as sent; provider_not_supported has its own AC-6 text, and
 * workflow_invalid gets the failing rule appended when the message omits it.
 */
export function describeCiError(err: unknown, providerMessage: string): string {
  if (!(err instanceof ApiError)) return err instanceof Error ? err.message : String(err);
  if (err.code === ERR_PROVIDER_NOT_SUPPORTED) return providerMessage;
  if (err.code === ERR_WORKFLOW_INVALID) {
    const reason = (err.details as { reason?: unknown } | null | undefined)?.reason;
    if (typeof reason === "string" && !err.message.includes(reason)) return `${err.message}: ${reason}`;
  }
  return err.message;
}
