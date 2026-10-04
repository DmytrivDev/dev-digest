/* BriefFileRef — a `file[:line]` reference from the PR Brief (risk refs, review
   focus). Public surface: the component, its nav contract and the pure helpers. */
export { BriefFileRef } from "./BriefFileRef";
export type { BriefNav } from "./BriefFileRef";
export { splitRef, blobHref } from "./helpers";
