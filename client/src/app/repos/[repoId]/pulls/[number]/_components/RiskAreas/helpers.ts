import type { IconName } from "@devdigest/ui";
import { RISK_FALLBACK_ICON, RISK_ICON, RISK_SEV } from "./constants";

/** Own-property lookup: `kind` and `severity` are free model strings, and a plain
 *  `map[key]` would resolve `constructor` / `__proto__` / `toString` to inherited
 *  members that are neither nullish nor an icon name / colour. */
function ownValue<V>(map: Record<string, V>, key: string): V | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

/** Icon for a risk kind; any unlisted kind (including prototype keys) → the fallback. */
export function riskIconName(kind: string): IconName {
  return ownValue(RISK_ICON, kind) ?? RISK_FALLBACK_ICON;
}

/** Colour for a risk severity; any unlisted severity → the `low` colour. */
export function riskColor(severity: string): string {
  return ownValue(RISK_SEV, severity) ?? RISK_SEV.low!;
}
