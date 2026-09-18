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
 * Preview comes FIRST because it is also the landing tab: opening a skill from
 * the list is a request to read it, not to edit it, and a tab order that does
 * not start with the default reads as if the page opened on the wrong one.
 * `TABS[0].key` is the default, so the two cannot drift apart.
 */
export const TABS: readonly SkillEditorTab[] = [
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];

/** Tab keys the ?tab= param may take. */
export const VALID_TABS: readonly string[] = TABS.map((t) => t.key);

/** Tab shown when `?tab=` is absent or unrecognised. */
export const DEFAULT_TAB: string = TABS[0]!.key;
