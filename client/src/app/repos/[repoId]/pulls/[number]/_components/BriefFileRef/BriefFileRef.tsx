"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MonoLink } from "@devdigest/ui";
import { s } from "./styles";

/** What the brief's file references need to navigate: which paths are PR files, how
 *  to link one that is not, and what to do for one that is. Built once by the
 *  Overview container. */
export interface BriefNav {
  prPaths: ReadonlySet<string>;
  /** github.com blob link for a path outside the diff; null when it cannot be built. */
  blobHref: (path: string, line: number | null) => string | null;
  onOpen: (path: string, line: number | null) => void;
}

interface BriefFileRefProps {
  path: string;
  line: number | null;
  /** The text shown, e.g. `src/a.ts:12-18`. */
  label: string;
  nav: BriefNav;
}

/**
 * One file reference of the brief: a mono accent button. A PR file opens in Files
 * changed; any other file (a blast-radius caller) keeps the user on Overview and
 * shows "File not in this PR's diff" with a link to the file on GitHub.
 */
export function BriefFileRef({ path, line, label, nav }: BriefFileRefProps) {
  const t = useTranslations("brief");
  const [missed, setMissed] = React.useState(false);
  const githubHref = missed ? nav.blobHref(path, line) : null;

  const open = () => {
    if (nav.prPaths.has(path)) nav.onOpen(path, line);
    else setMissed(true);
  };

  return (
    <span style={s.wrap}>
      <button type="button" className="mono" style={s.ref} onClick={open}>
        {label}
      </button>
      {missed && (
        <span style={s.notInDiff}>
          {t("nav.notInDiff")}
          {githubHref && (
            <>
              {" · "}
              <MonoLink href={githubHref}>{t("nav.openOnGithub")}</MonoLink>
            </>
          )}
        </span>
      )}
    </span>
  );
}
