/**
 * Project Context caps and vocabulary. Pure data — no I/O — so this file is
 * ring 1 (docs/plans/project-context.plan.md, W5).
 */

/** File-name extensions that make a file a "document" (matched case-insensitively). */
export const DOC_EXTENSIONS = ['.md', '.markdown'] as const;

/**
 * Directory names the listing never descends into and no listed path may contain (AC-2).
 * `.claude` holds agent/skill tooling definitions, not project requirements.
 */
export const EXCLUDED_DIRS = ['node_modules', 'dist', '.next', 'vendor', '.git', '.claude'] as const;

/** The document list is capped here; `total` + `truncated` report the rest (AC-5). */
export const MAX_LISTED_DOCS = 500;

/** A save carries at most this many paths (AC-71). Mirrors `SaveContextDocsInput`. */
export const MAX_SAVE_PATHS = 500;

/** Stable machine codes of the module's API errors. */
export const ERR_REPO_NOT_CLONED = 'repo_not_cloned';
export const ERR_INVALID_PATH = 'invalid_path';
export const ERR_DOC_NOT_FOUND = 'doc_not_found';
export const ERR_UNREADABLE = 'unreadable';

/** Why a run skipped an attached document (AC-56..AC-58, A-5). */
export type SkipReason = 'missing' | 'unreadable' | 'outside_clone';
