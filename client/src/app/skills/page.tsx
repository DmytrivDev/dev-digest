import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills list). Thin route entry — the view, its create modal,
   import drawer, preview drawer, styles and helpers are colocated under
   _components/SkillsListView and _components/SkillCard. */
export default function SkillsPage() {
  return <SkillsListView />;
}
