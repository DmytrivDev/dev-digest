// Bundles `src/index.ts` into `dist/index.js` with esbuild (D4). The tsconfig
// `paths` alias for `@devdigest/shared` is resolved and inlined at build time;
// `zod` and `@modelcontextprotocol/sdk` stay external so they resolve from
// `mcp/node_modules` at runtime — one zod instance, no tsx in the hot path.
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

export async function build() {
  await esbuild.build({
    entryPoints: [path.join(root, 'src/index.ts')],
    outfile: path.join(root, 'dist/index.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: ['zod', '@modelcontextprotocol/sdk'],
    sourcemap: false,
    logLevel: 'info',
  });
}

// Run directly (`node scripts/build.mjs`) vs imported by the stdout-purity test.
// Path-suffix check rather than exact URL comparison: robust to Windows'
// backslash argv[1] vs the forward-slash `file://` URL Node gives this module.
const invokedDirectly = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
