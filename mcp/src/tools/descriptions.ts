/**
 * D9 — FINAL, copied VERBATIM (approved by the user 2026-09-25). Do not reword,
 * add examples, or change trailing punctuation. `test/tools-list-budget.test.ts`
 * asserts equality with these exact strings — changing a text here without
 * updating `docs/plans/devdigest-mcp.plan.md`'s D9 table first fails that test
 * on purpose.
 */

export const TOOL_DESCRIPTIONS = {
  list_agents:
    'List the PR reviewer agents configured in DevDigest: id, name, purpose, model and whether enabled. Pass an id or name as "agent" to run_agent_on_pr.',
  run_agent_on_pr:
    'Review a pull request with one DevDigest agent (a paid LLM run) and return the verdict and top findings, waiting up to 2 minutes. If it is not finished by then, returns status "running" and a run_id for get_findings.',
  get_findings:
    'Get the verdict and top findings of a review run by run_id, or its status while it is still running. Use it after run_agent_on_pr returns status "running".',
  get_conventions:
    'Get the accepted coding conventions of a repository imported into DevDigest (category, rule, evidence file:line) and how many candidates still await triage.',
  get_blast_radius:
    'Show what a pull request can affect, read from the DevDigest code index: symbols declared in the changed files, their callers (file:line), and the HTTP endpoints and crons behind them. No LLM call.',
} as const;

export const PARAM_DESCRIPTIONS = {
  repo: 'Repository as "owner/name", as imported in DevDigest.',
  agent: 'Agent id or name from list_agents.',
  run_id: 'run_id returned by run_agent_on_pr.',
} as const;
