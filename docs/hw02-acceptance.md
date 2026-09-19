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
| 16 | Хоча б один скіл походженням «імпортовано» | ✅ | `response-schema` заведений шляхом драйвера (preview → save з `enabled:false`), `source: imported_url`, прилінкований до API Contract Reviewer; у трасі позначений `untrusted` |
| 17 | Контрольний експеримент — Test Quality | ✅ | PR #4: без рубрики `approve` / 0 знахідок → з рубрикою WARNING про 5 непокритих гілок. Сидовий агент для цього НЕ годиться — правила вже в його промпті; деталі в `docs/experiment-skills-ab.md` |
| 18 | Контрольний експеримент — API Contract | ✅ | PR #3: без скілів score 97 / `comment` / 1 SUGGESTION → зі скілами score 30 / `request_changes` / 2 CRITICAL із цитатами правил (`docs/experiment-skills-ab.md`) |
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
| 38 | `POST /repos/:id/conventions/extract` | ✅ | `server/src/modules/conventions/routes.ts:91` — синхронний скан з лімітом 5/хв; модуль зареєстрований у `modules/index.ts:34` |
| 39 | Відбір зразків без моделі | ✅ | `service.ts:342` — `repoIntel.getConventionSamples` (top-N за рангом) плюс окреме читання `CONFIG_SAMPLE_PATHS` по пакетних теках (`helpers.ts:37`) — вибір чисто кодовий |
| 40 | Формат кандидата від моделі | ✅ | `prompt.ts:144` — Zod-схема `ExtractedConventions` для `completeStructured`: category/rule/evidence/confidence, докази перевіряються по реальних файлах (`helpers.ts:120`) |
| 41 | Модалка створення — редагування тіла | ✅ | `SkillDraftModal` — draft із сервера в редагованих Name/Description/Body; незмінене поле не йде в POST |
| 42 | Approved → скіл `repo-conventions` | ✅ | `helpers.ts:239` `buildSkillDraft` + `POST /repos/:id/conventions/skill` через `SkillsService` — незмінений набір не палить версію |
| 43 | 4 скіли API Contract Reviewer | ✅ | `docs/skills/api-contract/` — breaking-change, response-schema, semver-discipline, deprecation-policy; у кожного директивний опис (172–190 симв.) і пари «добре/погано» |
| 44 | Conventions у SKILLS LAB | ✅ | `client/src/vendor/ui/nav.ts` — четвертий пункт із токеном `:repoId`; перевірено на живій сторінці |
| 45 | Кнопки Run Scan / ReScan | ✅ | `Run extraction` у порожньому стані, `Re-scan` у шапці; на час скану кнопка заблокована (`Scanning…`) |
| 46 | Картки кандидатів після скану | ✅ | `CandidateCard` — правило, категорія, доказ-permalink, confidence |
| 47 | Accept / Reject / Edit на картці | ✅ | усі три через один `PUT /conventions/:id` (`useUpdateConvention`) |
| 48 | Reject зберігається | ✅ | UI-половина: таб `Rejected` + `?status=` в URL — відхилений не повертається в Pending після перезавантаження |
| 49 | Edit inline | ✅ | картка стає формою на місці, блок доказу лишається на екрані |
| 50 | Кнопка Create skill | ✅ | з'являється, коли `accepted > 0` (похідний стан, не прапорець) |
| 51 | Модалка Create skill | ✅ | пояснення «merged from N», Name/Description/Body, Cancel і Create |
| 52 | Новий скіл видно на сторінці Skills | ✅ | інвалідація `["skills"]` у `useCreateConventionSkill`; перевірено живим переходом без перезавантаження |
| 53 | Settings → Models → Conventions | ✅ | `FEATURE_MODELS` містить `conventions`; `SettingsModels` малює рядок із `SearchableSelect` (список живий з OpenRouter) |

## Підсумок

- ✅ **51** — усе, крім двох пунктів нижче: L02 + три `.claude` скіли + кроки 1–3
  (сайдбар, панель, `agent_count`, модалки, фіча Conventions від роута до сторінки)
  + крок 4–5 (чотири скіли API Contract, імпортований скіл і обидва контрольні
  експерименти).
- ❌ **2** — перехід на AGENTS.md (1–2), свідомо відкинутий як необов'язковий:
  за формулюванням критерію він не застосовується, поки `AGENTS.md` у репо немає.

### Кроки 4–5 (зроблено 2026-09-19)
Чотири скіли API Contract Reviewer, агент на `deepseek-v4-flash`, і два A/B
експерименти на навмисних PR #3 і #4 — числа, id прогонів і цитати знахідок у
[experiment-skills-ab.md](experiment-skills-ab.md).

### Крок 3 (зроблено 2026-09-19)
Сторінка `/repos/:repoId/conventions`: скан із заблокованою на час виконання
кнопкою, картки кандидатів із клікабельним доказом, Accept / Reject / inline
Edit через один `PUT`, фільтр триажу з `?status=` в URL, звіт скану і модалка
створення скіла з серверного драфта. Рішення й обґрунтування —
`client/specs/L02-conventions.md`. Перевірено: `pnpm typecheck`, `pnpm test`
(client 179, було 144), `pnpm build` (обовʼязковий — зʼявилися value-імпорти з
`@devdigest/shared`), і живий прохід на репозиторії `DmytrivDev/dev-digest`:
Re-scan (12 запропоновано / 12 залишено, триаж збережено), Accept, Create skill
і новий `repo-conventions` на `/skills` без перезавантаження; посилання на доказ
відкриває реальний файл на GitHub (HTTP 200 на permalink із sha скану).

### Крок 2 (зроблено 2026-09-19)
Серверний модуль `server/src/modules/conventions/` — синхронний скан
(`POST /repos/:id/conventions/extract`, ліміт 5/хв, власний дедлайн 120 с),
вибір зразків чистим кодом (ранжовані файли + окремий читач конфігів по
пакетних теках), один виклик моделі зі структурованою схемою, і валідація
доказів по реальних файлах — кандидат, який не показує рядок коду, не
зберігається взагалі. Триаж став тристановим (`status` замість `accepted
boolean`, міграції `0013`/`0014`), тож повторний скан не воскрешає відхилене:
ідентичність — `fingerprint` нормалізованого тексту правила. Плюс
`PUT /conventions/:id` (триаж і ручне редагування одним роутом) і збірка
прийнятих у скіл `repo-conventions` через `SkillsService`, з попереднім
переглядом `GET .../skill/draft`. Специфікація й обґрунтування —
`server/specs/L02-conventions.md`. Перевірено: `pnpm typecheck`, 228 юніт-тестів
і 23 інтеграційні (`test/conventions.it.test.ts`) проти живого Postgres.

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
