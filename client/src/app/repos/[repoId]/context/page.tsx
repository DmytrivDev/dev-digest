import { ContextView } from "./_components/ContextView";

/* Route: /repos/:repoId/context (Project Context). Thin route entry — the
   document list, filter and preview pane are colocated under _components/. */
export default function ContextPage() {
  return <ContextView />;
}
