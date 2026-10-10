"use client";

import { useParams } from "next/navigation";
import { EvalAgentDetail } from "./_components/EvalAgentDetail";

/* Route: /eval/:agentId (one agent's eval dashboard). Thin route entry — the
   agent id comes from the URL, so a reload lands on the same agent (AC-80). */
export default function EvalAgentPage() {
  const { agentId } = useParams<{ agentId: string }>();
  return <EvalAgentDetail agentId={agentId} />;
}
