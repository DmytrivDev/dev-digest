import { EvalOverview } from "./_components/EvalOverview";

/* Route: /eval (Eval Dashboard overview). Thin route entry — the table and its
   AppShell live in _components/EvalOverview. Deliberately static: no
   useSearchParams here, or `next build` demands a Suspense boundary. */
export default function EvalPage() {
  return <EvalOverview />;
}
