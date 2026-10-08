import type { EvalIneligibleReason } from '@devdigest/shared';

/**
 * Why a finding cannot be turned into an eval case, or null when it can (AC-2…AC-4,
 * AC-25). Pure and shared by the eval service (create path) and the reviews service
 * (the per-finding fields of `GET /pulls/:id/reviews`), so the button and the endpoint
 * can never disagree.
 *
 * Precedence is deliberate: no agent on the review → `not_agent_finding` (hidden);
 * then untriaged → `not_triaged` (hidden); only a triaged finding whose agent was
 * deleted is `agent_missing` (shown, disabled). The create path maps `not_triaged` to
 * the wire code `finding_not_triaged`.
 */
export function evalIneligibleReason(
  triage: { acceptedAt?: Date | string | null; dismissedAt?: Date | string | null },
  reviewAgentId: string | null | undefined,
  agentExists: boolean,
): EvalIneligibleReason | null {
  if (!reviewAgentId) return 'not_agent_finding';
  if (!triage.acceptedAt && !triage.dismissedAt) return 'not_triaged';
  if (!agentExists) return 'agent_missing';
  return null;
}
