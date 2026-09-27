#!/usr/bin/env node
/**
 * UserPromptSubmit hook: injects the read-first half of the engineering-insights
 * loop on EVERY prompt, so it does not depend on the model remembering to.
 * Kept to a couple of lines — this cost is paid once per prompt.
 */
const context = [
  "engineering-insights loop — before any other work on this prompt:",
  "read the INSIGHTS.md of the package the prompt touches (client/, server/, reviewer-core/, e2e/, mcp/).",
  "Re-read it when the work moves to a different package; do not rely on an earlier turn's read.",
].join(" ");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context },
    suppressOutput: true,
  })
);
