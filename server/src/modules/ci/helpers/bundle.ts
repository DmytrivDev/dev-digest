/** Pure assembly of the exported file set (ring 1 — no I/O). */
import { strToU8, zipSync } from 'fflate';
import type { CiFile } from '@devdigest/shared';

export type BundleKind = 'manifest' | 'skill' | 'memory' | 'runner' | 'workflow';

/** A file of the bundle with its full contents (the preview hides runner bodies). */
export interface BundleFile {
  path: string;
  contents: string;
  kind: BundleKind;
  /** Set on `skill` files: the skill the path was derived from. */
  skillId?: string;
}

export interface BundleInput {
  manifest: { path: string; contents: string };
  skills: { path: string; contents: string; skillId: string }[];
  runner: { path: string; contents: string }[];
  workflow: { path: string; contents: string };
}

/** Manifest, skills (link order), empty memory, runner files, then the workflow last. */
export function assembleFiles(input: BundleInput, memoryPath: string): BundleFile[] {
  return [
    { ...input.manifest, kind: 'manifest' },
    ...input.skills.map((s): BundleFile => ({
      path: s.path,
      contents: s.contents,
      kind: 'skill',
      skillId: s.skillId,
    })),
    { path: memoryPath, contents: '', kind: 'memory' },
    ...input.runner.map((r): BundleFile => ({ ...r, kind: 'runner' })),
    { ...input.workflow, kind: 'workflow' },
  ];
}

/** Preview shape: only the workflow is editable; runner files show a size, never contents. */
export function toPreviewFiles(files: BundleFile[]): CiFile[] {
  return files.map((f) => ({
    path: f.path,
    contents: f.kind === 'runner' ? null : f.contents,
    editable: f.kind === 'workflow',
    size_bytes: Buffer.byteLength(f.contents, 'utf8'),
  }));
}

/** Zip with every file at its repository path. */
export function zipFiles(files: BundleFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path] = strToU8(f.contents);
  return zipSync(entries);
}
