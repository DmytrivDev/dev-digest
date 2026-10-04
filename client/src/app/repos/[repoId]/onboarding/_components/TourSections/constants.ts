import type { OnboardingSectionKind } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import type { NodeClassStyles } from "@/components/mermaid-diagram";

/** The five sections in the order the page shows them (AC-90). The wire tuple
    `OnboardingTour.sections` is pinned to the same order, and `TocNav` renders
    one link per entry here — keep the two in step. */
export const SECTION_KINDS = [
  "architecture_overview",
  "critical_paths",
  "how_to_run",
  "guided_reading",
  "first_tasks",
] as const satisfies readonly OnboardingSectionKind[];

/** Distance (px) below the top of the scroll container at which a section
    counts as "current" for the table of contents (AC-93). */
export const ACTIVE_OFFSET_PX = 96;

/** How long a copy button shows its "copied" state. */
export const COPIED_MS = 1200;

/** The icon in each section's header tile, as drawn in the mock. */
export const SECTION_ICONS = {
  architecture_overview: "Boxes",
  critical_paths: "Activity",
  how_to_run: "Command",
  guided_reading: "ListChecks",
  first_tasks: "Target",
} as const satisfies Record<OnboardingSectionKind, IconName>;

/** Badge colour per first-task complexity. */
export const COMPLEXITY_COLOR = {
  Low: "var(--ok)",
  Medium: "var(--warn)",
  High: "var(--crit)",
} as const;

/** The roles the server lets a diagram node carry (`A:::role`, see the server's
    `DIAGRAM_ROLES`), in legend order, with the token that colours each node's border. */
export const DIAGRAM_ROLE_STYLES = {
  client: { color: "--info" },
  service: { color: "--accent" },
  engine: { color: "--warn" },
  data: { color: "--ok" },
  external: { color: "--crit" },
  shared: { color: "--text-muted", dashed: true },
} as const satisfies NodeClassStyles;

export type DiagramRole = keyof typeof DIAGRAM_ROLE_STYLES;
