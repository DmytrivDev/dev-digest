import type { CiFailOn } from "@devdigest/shared";

/** CI gate policy options — when a CI review blocks/fails (labels: `agents.config.ciFailOnOptions.*`). */
export const CI_FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Age thresholds of `relativeTime`: below the first it is "just now". */
export const AGE_MS = { minute: MINUTE_MS, hour: HOUR_MS, day: DAY_MS } as const;
