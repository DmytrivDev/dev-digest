import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (Conventions extractor). Thin route entry —
   the view, its triage filter, scan report, candidate cards and the skill draft
   modal are colocated under _components/. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
