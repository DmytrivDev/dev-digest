import { Suspense } from "react";
import { ConfigureRunView } from "./_components/ConfigureRunView";

/* Route: /multi-agent (Configure run, SPEC-08). The view reads `?pr=` through
   useSearchParams, so a static route MUST wrap it in <Suspense> or `next build`
   fails. */
export default function MultiAgentPage() {
  return (
    <Suspense fallback={null}>
      <ConfigureRunView />
    </Suspense>
  );
}
