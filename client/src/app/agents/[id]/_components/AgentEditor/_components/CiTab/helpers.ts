import type { CiInstallation } from "@devdigest/shared";
import type { WizardInitial } from "./_components/ExportWizard";
import { AGE_MS } from "./constants";

/** The most recently exported installation — "Update CI config" reopens it (AC-5). */
export function newestInstallation(list: readonly CiInstallation[]): CiInstallation | undefined {
  return list.reduce<CiInstallation | undefined>(
    (best, i) => (best === undefined || Date.parse(i.installed_at) > Date.parse(best.installed_at) ? i : best),
    undefined,
  );
}

/** What the wizard opens with for an existing installation. */
export function wizardInitialOf(installation: CiInstallation): WizardInitial {
  return {
    repoId: installation.repo_id,
    triggers: installation.triggers,
    postAs: installation.post_as,
  };
}

/** Which `ciTab.ago.*` message to use, and its count; null when `iso` does not parse. */
export function relativeTime(
  iso: string,
  now: number,
): { key: "now" | "minutes" | "hours" | "days"; n: number } | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const age = Math.max(0, now - then);
  if (age < AGE_MS.minute) return { key: "now", n: 0 };
  if (age < AGE_MS.hour) return { key: "minutes", n: Math.floor(age / AGE_MS.minute) };
  if (age < AGE_MS.day) return { key: "hours", n: Math.floor(age / AGE_MS.hour) };
  return { key: "days", n: Math.floor(age / AGE_MS.day) };
}
