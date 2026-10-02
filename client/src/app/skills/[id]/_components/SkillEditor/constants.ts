import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface SkillEditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/**
 * Editor tabs. The mock's Evals tab still belongs to a later lesson — a tab
 * that renders a placeholder is worse than no tab.
 *
 * Config comes FIRST because it is also the landing tab. This REVERSES the
 * earlier decision (`client/specs/L02-skills.md` R3, "Preview first: opening a
 * skill is a request to read it") on purpose — SPEC-01 D-18 / AC-24 make Config
 * the landing tab, with Context right after it. The legacy L02 spec is history
 * and is left as written. A tab order that does not start with the default reads
 * as if the page opened on the wrong one, and `TABS[0].key` is the default, so
 * the two cannot drift apart.
 */
export const TABS: readonly SkillEditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "context", labelKey: "editor.tabs.context", icon: "FileText" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];

/** Tab keys the ?tab= param may take. */
export const VALID_TABS: readonly string[] = TABS.map((t) => t.key);

/** Tab shown when `?tab=` is absent or unrecognised. */
export const DEFAULT_TAB: string = TABS[0]!.key;
