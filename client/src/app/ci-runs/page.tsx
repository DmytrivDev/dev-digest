import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs (runs executed inside CI, SPEC-09). Thin route entry — the
   header, table and AppShell live in _components/CiRunsView. Deliberately
   static: no useSearchParams here, or `next build` demands a Suspense boundary. */
export default function CiRunsPage() {
  return <CiRunsView />;
}
