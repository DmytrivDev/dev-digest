# ДЗ №2 — стан по критеріях

Зріз на гілці `feat/l02-skills-claude-md-commands` (лабораторна L02 змерджена в гілку,
ДЗ ще не починалось). Легенда: **✅** зроблено · **🟡** частково / є фундамент ·
**❌** немає.

| № | Критерій | Стан | Де це / чого бракує |
|---|---|---|---|
| 1 | AGENTS.md (корінь) | ❌ | є `CLAUDE.md`, `AGENTS.md` немає — потрібен rename + symlink/`@AGENTS.md` |
| 2 | AGENTS.md (server/client/reviewer-core) | ❌ | `server/CLAUDE.md`, `client/CLAUDE.md`, `reviewer-core/CLAUDE.md` (+ `e2e/`) — той самий патерн |
| 3 | Скіл UI-архітектури | ✅ | `.claude/skills/frontend-ui-architecture/SKILL.md` (+ `component-anatomy.md`) |
| 4 | Скіл Onion-архітектури | ✅ | `.claude/skills/onion-architecture/SKILL.md` (+ `enforcement.md`, `pnpm arch:check`) |
| 5 | Скіл pr-self-review | ✅ | `.claude/skills/pr-self-review/SKILL.md` — диспетчер через `routing.json` |
| 6 | Agents у секції SKILLS LAB | ✅ | `client/src/vendor/ui/nav.ts` — Agents і Skills в одній секції; перевірено на живій сторінці |
| 7 | Сторінка Agents — сітка карток | ✅ | `client/src/app/agents/_components/AgentsListView` |
| 8 | CRUD `/skills` у Postgres | ✅ | `server/src/modules/skills/routes.ts` — GET/POST/PUT/DELETE + repository на Drizzle |
| 9 | Сторінка Skills — сітка карток | ✅ | `client/src/app/skills/_components/SkillCard` — назва, тип, опис, тогл |
| 10 | Клік по картці → прев'ю в БІЧНІЙ панелі | ✅ | `SkillPreviewPanel` (read-only, кнопка `Open editor`); R2 і критерій 3 у `client/specs/L02-skills.md` переписані під нове рішення |
| 11 | Кнопка «додати» → створити / імпортувати | ✅ | `SkillsListView` — Dropdown + `CreateSkillModal` |
| 12 | Форма скіла (назва/опис/тип/тіло) | ✅ | `CreateSkillModal.tsx` |
| 13 | Вкладка Skills у редакторі агента (bind / toggle / drag&drop) | ✅ | `client/src/app/agents/[id]/.../SkillsTab` |
| 14 | Порядок drag&drop впливає на промпт | ✅ | `server/src/modules/reviews/run-executor.ts:359` — блоки в link-order |
| 15 | Імпорт `.md` / `.zip` з прев'ю | ✅ | `ImportSkillDrawer` + `POST /skills/import/preview`, `modules/skills/import-parse.ts` |
| 16 | Хоча б один скіл походженням «імпортовано» | ❌ | сид пише `source: 'manual'` (`server/src/db/seed.ts:256`) — треба реальний імпорт і лінк до нового агента |
| 17 | Контрольний експеримент — Test Quality | 🟡 | процедура є (`docs/visual-test-skills.md`, §6a–6c), самого прогону з доказами ще не робили |
| 18 | Контрольний експеримент — API Contract | 🟡 | те саме, §6d — позначено як optional, не виконано |
| 19 | Скіли в трасі промпта + токени блоку | ✅ | `PromptAssembly.token_counts` + `SkillsUsedSection` у `RunTraceDrawer` |
| 20 | Увімкнено/вимкнено видно в логах | ✅ | `skills: N of M linked skill(s) attached (K disabled)`; вимкнений скіл не дає блоку |
| 21 | pr-self-review вручну на змішаний diff, без хука | ✅ | `.claude/settings.json` має лише insights-хуки; `routing.json` покриває і `client/**`, і `server/**` |
| 22 | Картка скіла: версія + `agent_count` | ✅ | `agent_count` у контракті (обидві копії), один груповий запит у `skills/repository.ts`, бейдж на картці; absent ≠ 0 |
| 23 | Кнопка «Видалити» на картці скіла | ✅ | `SkillCard.tsx:44` |
| 24 | Підтвердження видалення скіла — модалка | ✅ | `components/ConfirmDialog` (confirm / cancel / X) — на картці, у danger zone і на Restore |
| 25 | Вкладки `/skills/:id` | ✅ | Preview · Config · Stats · Versions |
| 26 | Preview — рендерений markdown | ✅ | `PreviewTab` через `Markdown` |
| 27 | Versioning — список версій | ✅ | `VersionsTab` + `GET /skills/:id/versions` |
| 28 | Кнопка Diff | ✅ | `VersionsTab.tsx:70` — line diff проти поточного тіла |
| 29 | Кнопка Restore | ✅ | `POST /skills/:id/versions/:n/restore` — пише вперед новою версією |
| 30 | Пошук у Skills-табі агента | ✅ | `SkillsTab` filter box |
| 31 | Drag&drop лише для увімкнених | ✅ | `draggable={isLinked}` |
| 32 | Плитка агента — базові поля | ✅ | назва, опис, модель, тогл, лічильник скілів |
| 33 | Кнопка «Видалити» на плитці агента | ✅ | `AgentCard.tsx:41` |
| 34 | Підтвердження видалення агента — модалка | ✅ | той самий `ConfirmDialog` на плитці агента |
| 35 | Сторінка агента — рівно 2 вкладки | ✅ | `AgentEditor/constants.ts` — config + skills |
| 36 | Config агента — поля | ✅ | name/description/provider/model(SearchableSelect)/strategy/system prompt |
| 37 | Skills-таб — усі скіли + тип | ✅ | список усіх скілів воркспейсу, чекбокс + type chip |
| 38 | `POST /repos/:id/conventions/extract` | ❌ | модуля conventions немає (`server/src/modules/index.ts`) |
| 39 | Відбір зразків без моделі | 🟡 | `repoIntel.getConventionSamples()` існує (`repo-intel/service.ts:640`), але його ніхто не викликає; конфігів (eslint/tsconfig/prettier) у вибірці немає |
| 40 | Формат кандидата від моделі | ❌ | немає промпта/схеми кандидата |
| 41 | Модалка створення — редагування тіла | ❌ | немає сторінки Conventions |
| 42 | Approved → скіл `repo-conventions` | ❌ | таблиця `conventions` є (`db/schema/knowledge.ts:31`), логіки збірки немає |
| 43 | 4 скіли API Contract Reviewer | ❌ | у сиді один `api-contract-guard`; треба breaking-change, response-schema, semver-discipline, deprecation-policy |
| 44 | Conventions у SKILLS LAB | ❌ | пункту немає в `nav.ts` |
| 45 | Кнопки Run Scan / ReScan | ❌ | — |
| 46 | Картки кандидатів після скану | ❌ | — |
| 47 | Accept / Reject / Edit на картці | ❌ | — |
| 48 | Reject зберігається | ❌ | у таблиці лише `accepted boolean` — стану «відхилено» немає |
| 49 | Edit inline | ❌ | — |
| 50 | Кнопка Create skill | ❌ | — |
| 51 | Модалка Create skill | ❌ | — |
| 52 | Новий скіл видно на сторінці Skills | ❌ | наслідок 42/50 |
| 53 | Settings → Models → Conventions | ✅ | `FEATURE_MODELS` містить `conventions`; `SettingsModels` малює рядок із `SearchableSelect` (список живий з OpenRouter) |

## Підсумок

- ✅ **33** — L02 (скіли, редактор, імпорт, траса) + три `.claude` скіли + крок 1 ДЗ
  (6, 10, 22, 24, 34).
- 🟡 **3** — 17, 18 (експерименти не прогнані), 39 (є хелпер, немає виклику).
- ❌ **17** — AGENTS.md (1–2, свідомо відкинуто як необовʼязкове), Conventions у сайдбарі (44,
  разом зі сторінкою), імпортований скіл (16), 4 скіли API Contract (43) і вся фіча
  Conventions (38, 40–42, 45–52).

### Крок 1 (зроблено 2026-09-19)
Сайдбар · бічна панель прев'ю · `agent_count` · модалки підтвердження. Перевірено:
`pnpm typecheck` + `pnpm test` зелені в обох пакетах (client 144, server 171),
`skills.it.test.ts` проти живого Postgres, `pnpm arch:check` на базовій позначці
20 warnings / 0 errors.

## Що з цього суперечить лабораторній

- **№10** конфліктував з R2 специфікації L02, яка свідомо прибрала side drawer. Розвʼязано
  на користь критерію: панель повернуто як **read-only**, `/skills/:id` лишається єдиним
  місцем, де тіло можна редагувати, а R2 і критерій 3 у `client/specs/L02-skills.md`
  переписані з поясненням, чому рішення змінилось.
- **№25** вимагає Config/Preview/Versioning; наш набір ширший (є ще Stats) — це дозволено.
