/**
 * The generated GitHub Actions workflow (ring 1 — pure, I/O-free by hand).
 *
 * SECURITY SURFACE. Every rule below is a spec AC (18..26); the structure is
 * deliberately a fixed template — nothing user-controlled is interpolated
 * except the slug (kebab-case `[a-z0-9-]`) and the two enums.
 */
import type { CiPostAs, CiTrigger } from '@devdigest/shared';
import {
  CHECKOUT_SHA,
  FORK_REFUSAL_LINE,
  INSTALLING_SKIP_LINE,
  UPLOAD_ARTIFACT_SHA,
} from '../constants.js';
import { manifestPath } from './slug.js';

/** Fixed order so the same selection always renders the same text. */
const TRIGGER_ORDER: readonly CiTrigger[] = ['opened', 'synchronize', 'reopened'];

export interface WorkflowInput {
  slug: string;
  triggers: readonly CiTrigger[];
  postAs: CiPostAs;
}

export function renderWorkflow({ slug, triggers, postAs }: WorkflowInput): string {
  const types = TRIGGER_ORDER.filter((t) => triggers.includes(t)).join(', ');
  // `none` still reads the PR diff through the pulls API (AC-19).
  const pullRequests = postAs === 'none' ? 'read' : 'write';
  const jobName = `DevDigest Review (${slug})`;
  return `name: ${jobName}
on:
  pull_request:
    types: [${types}]
permissions:
  contents: read
  pull-requests: ${pullRequests}
concurrency:
  group: devdigest-${slug}-\${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  review:
    name: ${jobName}
    runs-on: ubuntu-latest
    steps:
      - name: Refuse fork pull requests
        if: github.event.pull_request.head.repo.full_name != github.repository
        run: |
          echo "${FORK_REFUSAL_LINE}"
          exit 1
      - name: Check out the base commit
        uses: actions/checkout@${CHECKOUT_SHA} # v4.4.0
        with:
          ref: \${{ github.event.pull_request.base.sha }}
          persist-credentials: false
      - name: Skip while DevDigest is being installed
        if: hashFiles('.devdigest/runner/index.js') == ''
        run: echo "${INSTALLING_SKIP_LINE}"
      - name: DevDigest review
        if: hashFiles('.devdigest/runner/index.js') != ''
        run: node .devdigest/runner/index.js
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          DEVDIGEST_MANIFEST: ${manifestPath(slug)}
          DEVDIGEST_POST_AS: ${postAs}
      - name: Upload DevDigest result
        if: always()
        uses: actions/upload-artifact@${UPLOAD_ARTIFACT_SHA} # v4.6.2
        with:
          name: devdigest-result
          path: devdigest-result.json
          if-no-files-found: ignore
`;
}
