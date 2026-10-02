import type { OnboardingSectionKind } from "@devdigest/shared";

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
