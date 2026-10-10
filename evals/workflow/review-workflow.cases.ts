import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + nested package
 * CLAUDE.md files + skills + subagents, loaded via settingSources:["project"]) behaves as documented.
 *
 * Budget: 6 Claude sessions total. Compatible checks are folded into one `trace` session each
 * (one session asserts reads + subagents + answer facts together); only what cannot share a session
 * stays separate:
 *   - near-miss NEGATIVE activation — a shared session would be polluted by the other topics;
 *   - `contrast` — needs its own control run (not used here).
 *
 * Trade-off of folding: coarser diagnostics (the failure message names the exact missing item, but
 * one flaky topic fails the whole case). Keep each prompt to one theme.
 *
 * Nested `client/CLAUDE.md` / `server/CLAUDE.md` / ... are injected by the harness when the agent
 * touches a file in that folder — they never appear in `filesRead`. Their effect is asserted through
 * `expectText` (a fact that exists ONLY there), so each such prompt must make the agent open a file
 * under that package.
 */
export const cases: WorkflowCase[] = [
  // 1. Root CLAUDE.md "Use when" routing: three doc rows in one session ---------------------------
  {
    kind: "trace",
    name: "root routing — git-workflow, sdd-workflow and skill-routing docs are consulted",
    prompt:
      "Перш ніж щось робити, звірся з настановами цього репо (CLAUDE.md) і ПРОЧИТАЙ відповідні документи " +
      "для трьох речей: (1) я збираюся закомітити зміни й відкрити PR; (2) я починаю нову фічу від " +
      "специфікації до коду; (3) мені треба знати, який скіл керує файлом server/src/modules/index.ts. " +
      "Кожен документ відкрий окремо, не відповідай з памʼяті.",
    expectFilesRead: ["docs/git-workflow.md", "docs/sdd-workflow.md", ".claude/skill-routing.md"],
    maxTurns: 10,
  },

  // 2. Nested client + server CLAUDE.md and the INSIGHTS protocol, one session --------------------
  {
    kind: "trace",
    name: "client + server nested CLAUDE.md and INSIGHTS.md are honored",
    prompt:
      "Я хочу (а) додати нову колонку в таблицю списку PR у client і (б) додати нове поле в результат " +
      "запуску агента в server. Нічого не змінюй. Спочатку ВІДКРИЙ ці файли (Read) і лише потім відповідай: " +
      "client/src/app/repos/[repoId]/pulls/constants.ts, client/src/app/repos/[repoId]/pulls/_components " +
      "(знайди PRRow.tsx), server/src/modules/reviews/repository/run.repo.ts і " +
      "server/src/modules/reviews/repository.ts. Потім скажи, на що в кожному пакеті мені треба звернути увагу.",
    // Nested CLAUDE.md load only when a file under that package is opened, hence the explicit Reads above.
    expectFilesRead: ["client/INSIGHTS.md", "server/INSIGHTS.md"],
    // client/CLAUDE.md: COLUMN_KEYS + GRID aligned, cell in PRRow.tsx.
    // server/CLAUDE.md: completeAgentRun is declared in TWO places (run.repo.ts AND repository.ts).
    expectText: ["COLUMN_KEYS", "GRID", "PRRow", "run.repo.ts"],
    maxTurns: 14,
  },

  // 3. Iron rules + do-not-touch: five prohibitions answered in one session -------------------------
  {
    kind: "trace",
    name: "iron rules and do-not-touch — reviewer-core no-I/O, mcp rings, migrations, lockfile, down -v",
    prompt:
      "П'ять запитів, по кожному дай коротку відповідь, чи це можна в цьому репо, і що робити замість. " +
      "Нічого не змінюй. (1) У reviewer-core/src прямо читати файл з диска всередині pipeline. (2) У " +
      "mcp/src/tools імпортувати адаптер з adapters/ напряму в тул — назви правило arch:check, яке це " +
      "порушить. (3) Дописати SQL руками у server/src/db/migrations/ нову колонку. (4) Відредагувати " +
      "server/pnpm-lock.yaml вручну. (5) Скинути dev-БД командою `docker compose down -v`. Для (1) і (2) " +
      "відкрий файл у відповідному пакеті.",
    // reviewer-core/CLAUDE.md Iron rule; mcp/CLAUDE.md rule name; root CLAUDE.md migrations + down -v.
    expectText: ["LLMProvider", "tools-no-driven-adapters", "db:generate", "down -v"],
    maxTurns: 12,
  },

  // 4. Subagent dispatch + route-map doc, one session ----------------------------------------------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    name: "API-route task reads server/README.md and dispatches architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Спершу звірся з мапою роутів та DI-потоком цього репо (server/README.md). Потім " +
      "ОБОВʼЯЗКОВО запусти сабагента architecture-reviewer, щоб він оцінив мій план на відповідність " +
      "onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/README.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // 5-6. Activation pair — the near-miss negative cannot share a session (positive is a trace, see below) ---------------------------
  {
    // trace, not activation: expectSkills stops the session the moment the skill is engaged, so the
    // skill's own (long) write-up never runs and cannot overrun maxTurns into isError.
    kind: "trace",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    expectSkills: ["engineering-insights"],
    maxTurns: 8,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків. " +
      "Відповідай коротко, зі знань, без пошуку по коді репо.",
    skill: "engineering-insights",
    shouldActivate: false,
    // 4 was too tight: the project hook forces an INSIGHTS.md read first, and the model then
    // explored src/db/schema until error_max_turns (isError → record outcome=false) — not an activation.
    maxTurns: 8,
  },
];
