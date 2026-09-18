/* Date/time rendering for the UI.
 *
 * Everything here pins the locale to "en-US" on purpose. A bare
 * `toLocaleString()` formats with the MACHINE locale, not the app's: the same
 * timestamp renders differently in a uk-locale browser and under vitest/jsdom,
 * so a test that asserts a formatted string passes locally and breaks
 * elsewhere — and in an SSR/CSR pair the two sides can disagree and produce a
 * hydration mismatch. The UI ships only the `en` locale, so the explicit
 * argument is not a limitation, it is the correct value made visible.
 *
 * Same rule as `formatCost` in ./cost.ts: an unparseable input is echoed back
 * rather than rendered as "Invalid Date".
 */

const LOCALE = "en-US";

/** Full date + time, e.g. "9/18/2026, 2:31:07 PM". Echoes `iso` if unparseable. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(LOCALE);
}

/** Time only, e.g. "2:31:07 PM". Echoes `iso` if unparseable. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString(LOCALE);
}
