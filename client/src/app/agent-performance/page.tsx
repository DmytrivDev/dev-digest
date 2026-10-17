import { Suspense } from "react";
import { AgentPerformanceView } from "./_components/AgentPerformanceView";

/* Route: /agent-performance (SPEC-10). The view reads the period window through
   useSearchParams, so a static route MUST wrap it in <Suspense> or `next build`
   fails. */
export default function AgentPerformancePage() {
  return (
    <Suspense fallback={null}>
      <AgentPerformanceView />
    </Suspense>
  );
}
