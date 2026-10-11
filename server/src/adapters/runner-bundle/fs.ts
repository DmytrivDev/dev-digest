import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunnerBundleFile, RunnerBundleSource } from '../../modules/ci/types.js';

/**
 * RunnerBundleSource over the local filesystem. Reads ONLY under the configured
 * directory (the built `agent-runner/dist`); never follows a path outside it.
 */
export class FsRunnerBundle implements RunnerBundleSource {
  constructor(private readonly dir: string) {}

  async list(): Promise<RunnerBundleFile[] | null> {
    try {
      const info = await stat(this.dir);
      if (!info.isDirectory()) return null;
    } catch {
      return null;
    }

    const files: RunnerBundleFile[] = [];
    await this.walk(this.dir, '', files);
    if (!files.some((f) => f.path === 'index.js')) return null;
    return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  private async walk(abs: string, rel: string, out: RunnerBundleFile[]): Promise<void> {
    const entries = await readdir(abs, { withFileTypes: true });
    for (const entry of entries) {
      // Always `/`-separated, even on Windows — these are repo-relative paths.
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = join(abs, entry.name);
      if (entry.isDirectory()) {
        await this.walk(childAbs, childRel, out);
      } else if (entry.isFile()) {
        const buf = await readFile(childAbs);
        out.push({ path: childRel, contents: buf.toString('utf8'), size_bytes: buf.byteLength });
      }
    }
  }
}
