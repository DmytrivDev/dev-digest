/* api.ts — typed fetch client for the F1 Fastify engine (localhost:3001).
   All hooks build on `apiFetch`. Errors are normalized to ApiError so the
   error-UX taxonomy (toast/inline/full-screen) can branch on status. */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        // Only declare a JSON body when one is actually sent — otherwise a
        // body-less POST/PUT (e.g. tour generate, refresh, reindex) trips
        // Fastify's "Body cannot be empty when content-type is application/json".
        ...(init?.body != null ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    // network failure / API down → full-screen error candidate
    throw new ApiError(
      `Cannot reach the DevDigest engine at ${API_BASE}. Is the API running?`,
      0,
      "network_error",
      e
    );
  }

  if (!res.ok) {
    let code: string | undefined;
    let message = `${res.status} ${res.statusText}`;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message ?? message;
        details = body.error.details;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * One entry of a Fastify + zod `validation_error` payload. Only the two fields
 * worth showing a human are named; the rest of the envelope is noise.
 */
interface ValidationIssue {
  /** JSON pointer to the offending field, e.g. "/description". */
  instancePath?: string;
  message?: string;
}

/** At most this many field errors reach a toast before it becomes a wall. */
const MAX_REPORTED_ISSUES = 3;

function validationFields(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  const seen = new Set<string>();
  for (const raw of details) {
    const issue = raw as ValidationIssue;
    if (!issue?.message) continue;
    const field = (issue.instancePath ?? "").replace(/^\//, "").replace(/\//g, ".");
    seen.add(field ? `${field} — ${issue.message}` : issue.message);
  }
  return [...seen].slice(0, MAX_REPORTED_ISSUES);
}

/**
 * Human-readable text for any thrown value, for the global error toast.
 *
 * A 422 from the API carries only "Request validation failed" in `message`;
 * WHICH field and WHY live in `details`. Dropping them produced a real dead
 * end: saving a skill failed with "Request validation failed" while the field
 * at fault (an over-long description inherited from the seed) was one the user
 * had not touched, because the editor posts every field in one patch. A
 * validation error that does not name its field is indistinguishable from a
 * bug in the app.
 */
export function describeApiError(e: unknown): string {
  if (e instanceof ApiError) {
    const fields = validationFields(e.details);
    return fields.length > 0 ? `${e.message}: ${fields.join("; ")}` : e.message;
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
