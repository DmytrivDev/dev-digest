/**
 * `@devdigest/shared` exists as TWO hand-maintained copies —
 * `server/src/vendor/shared/` and `client/src/vendor/shared/` — resolved by a
 * tsconfig path alias rather than a published package. Nothing but discipline
 * kept them equal, and discipline lost: 5 of the 11 files had drifted, three of
 * them Zod schemas whose enums no longer admitted `openrouter`, the provider
 * every seeded agent runs on. A `.parse()` on valid server data would have
 * thrown at runtime, and `export *` in index.ts meant missing symbols were
 * silently absent rather than a compile error.
 *
 * This test is the mechanism that replaces the discipline. It is mirrored in
 * `server/test/` because CI filters jobs by path: a change under `client/` must
 * fail the client job, a change under `server/` must fail the server job.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Anchored on the package root rather than `import.meta.url`: under jsdom that
// is not a file:// URL, so fileURLToPath throws at collection time.
const CLIENT_ROOT = process.cwd();
const CLIENT_SHARED = join(CLIENT_ROOT, "src/vendor/shared");
const SERVER_SHARED = join(CLIENT_ROOT, "../server/src/vendor/shared");

const CRLF = String.fromCharCode(13, 10);
const LF = String.fromCharCode(10);
const SEP = String.fromCharCode(92);

/** Every .ts file under `root`, as paths relative to `root`, sorted. */
function listTs(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push(relative(root, full).split(SEP).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

/**
 * Line endings are normalised before comparing. On Windows a git operation can
 * rewrite one copy to CRLF and leave the other at LF — a checkout artefact, not
 * contract drift. What this guards is the CONTENT.
 */
function read(root: string, rel: string): string {
  return readFileSync(join(root, rel), "utf8").split(CRLF).join(LF);
}

describe("vendored @devdigest/shared copies", () => {
  it("contain the same files", () => {
    expect(listTs(CLIENT_SHARED)).toEqual(listTs(SERVER_SHARED));
  });

  it("have identical content", () => {
    const mismatched = listTs(SERVER_SHARED).filter(
      (rel) => read(SERVER_SHARED, rel) !== read(CLIENT_SHARED, rel),
    );
    expect(
      mismatched,
      "These vendored contract files have drifted between server/ and client/. " +
        "Edit both copies in lock-step — the server copy is canonical because " +
        "reviewer-core compiles against it too: " +
        mismatched.join(", "),
    ).toEqual([]);
  });
});
