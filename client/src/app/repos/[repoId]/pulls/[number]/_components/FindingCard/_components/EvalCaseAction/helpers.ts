import type { FindingRecord } from "@devdigest/shared";

/**
 * What the "Turn into eval case" slot of a FindingCard shows.
 *
 * - `hidden`        — untriaged, or the review was not produced by an agent;
 * - `agentMissing`  — triaged, but the agent that produced it was deleted;
 * - `available`     — a button: "Turn into eval case", or "In eval suite" once a
 *                     case exists.
 *
 * The server's `eval_ineligible_reason` wins; the triage timestamps are a second
 * guard so a finding that arrives without the eval fields (any endpoint other
 * than the PR reviews one) never offers the action while it is untriaged.
 */
export type EvalActionState = "hidden" | "agentMissing" | "available";

export function evalActionState(
  f: Pick<
    FindingRecord,
    "accepted_at" | "dismissed_at" | "eval_ineligible_reason"
  >,
): EvalActionState {
  const reason = f.eval_ineligible_reason;
  if (reason === "not_triaged" || reason === "not_agent_finding") return "hidden";
  if (!f.accepted_at && !f.dismissed_at) return "hidden";
  if (reason === "agent_missing") return "agentMissing";
  return "available";
}
