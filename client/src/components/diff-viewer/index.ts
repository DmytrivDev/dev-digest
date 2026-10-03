/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffAnnotation, DiffAnnotationApi } from "./annotations";
export type { DiffFocus } from "./focus";
export { isFocusedFile } from "./focus";
