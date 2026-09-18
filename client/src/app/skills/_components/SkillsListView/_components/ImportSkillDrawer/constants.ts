/** Constants for ImportSkillDrawer. */

/** What the file picker offers. Mirrors the server's accepted extensions. */
export const ACCEPTED_EXTENSIONS = ".md,.markdown,.zip";

/**
 * Client-side size guard, in bytes. The server enforces its own limit; this one
 * exists so a 50 MB archive fails instantly instead of after a base64 round
 * trip that the 1 MB body cap would reject anyway.
 */
export const MAX_UPLOAD_BYTES = 512 * 1024;

/** Drawer width (px). */
export const DRAWER_WIDTH = 640;
