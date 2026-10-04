/** Widest the page grows; the table of contents and the cards share it. */
export const PAGE_MAX_WIDTH = 1120;

/** Width of the sticky "On this page" column. */
export const TOC_WIDTH = 200;

/** Cards drawn while the tour loads. */
export const SKELETON_CARDS = 4;

/** How long a header copy button shows its confirmation. */
export const COPIED_MS = 1500;

/** Characters of the indexed commit shown in the subtitle (AC-29). */
export const SHORT_SHA_LENGTH = 7;

/** Where the "no API key" reason sends the user (AC-46). */
export const API_KEYS_HREF = "/settings/api-keys";

/** Providers that have a label under `onboarding.providers.*`. Anything else is
    shown as the raw provider id rather than as a missing-key path. */
export const PROVIDER_LABEL_KEYS = ["openai", "anthropic", "openrouter"] as const;

/** Shown in place of a provider name the tour did not record. */
export const UNKNOWN_PROVIDER = "—";

export const MS_PER_MINUTE = 60_000;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
