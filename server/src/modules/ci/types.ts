/**
 * ci — module-local port (ring 2), like `repo-intel/types.ts`.
 *
 * The CI service depends on THIS interface, never on the filesystem adapter, so
 * the built agent-runner bundle can be substituted in tests.
 */

/** One file of the built agent-runner bundle (path relative to the bundle root, `/`-separated). */
export interface RunnerBundleFile {
  path: string;
  contents: string;
  size_bytes: number;
}

export interface RunnerBundleSource {
  /**
   * Every file of the runner bundle, sorted by path; `null` when the bundle is
   * not available (directory missing, or no `index.js`) — the service maps that
   * to `runner_bundle_missing`.
   */
  list(): Promise<RunnerBundleFile[] | null>;
}
