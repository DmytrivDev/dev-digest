"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSectionKind } from "@devdigest/shared";
import { ACTIVE_OFFSET_PX, SECTION_KINDS } from "../../constants";
import { activeSection } from "../../helpers";
import { s } from "./styles";

/** "On this page" — one anchor per section, the one being read marked
    `aria-current` (AC-92). The app scrolls inside `<main>`, not the window
    (client/INSIGHTS.md), so that is where the passive scroll listener goes;
    the window is the fallback when no `<main>` wraps the nav. */
export function TocNav() {
  const t = useTranslations("onboarding");
  const navRef = React.useRef<HTMLElement>(null);
  const [active, setActive] = React.useState<OnboardingSectionKind>(SECTION_KINDS[0]);

  React.useEffect(() => {
    const scroller: HTMLElement | Window = navRef.current?.closest("main") ?? window;
    const update = () => {
      const base = scroller instanceof HTMLElement ? scroller.getBoundingClientRect().top : 0;
      const tops = SECTION_KINDS.flatMap((kind) => {
        const el = document.getElementById(kind);
        return el ? [{ kind, top: el.getBoundingClientRect().top - base }] : [];
      });
      const next = activeSection(tops, ACTIVE_OFFSET_PX);
      if (next) setActive(next);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, []);

  return (
    <nav ref={navRef} aria-label={t("sections.toc")} style={s.nav}>
      <div style={s.title}>{t("sections.toc")}</div>
      <ul style={s.list}>
        {SECTION_KINDS.map((kind) => (
          <li key={kind}>
            <a
              href={`#${kind}`}
              aria-current={active === kind ? "true" : undefined}
              style={s.link(active === kind)}
            >
              {t(`sections.${kind}`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
