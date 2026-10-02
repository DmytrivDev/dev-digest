"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingSectionKind } from "@devdigest/shared";
import { SECTION_ICONS } from "../../constants";
import { s } from "./styles";

/** One collapsible tour section. The collapsed state is local to the card, so
    toggling one never re-renders its siblings (AC-90, AC-91). The `id` is the
    wire kind — it is the anchor the table of contents links to. */
export function SectionCard({
  kind,
  children,
}: {
  kind: OnboardingSectionKind;
  children?: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const [open, setOpen] = React.useState(true);
  const headingId = `${kind}-heading`;
  const bodyId = `${kind}-body`;
  const KindIcon = Icon[SECTION_ICONS[kind]];

  return (
    <section id={kind} aria-labelledby={headingId} style={s.card}>
      <h2 id={headingId} style={s.heading}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          style={s.header}
        >
          <span aria-hidden="true" style={s.iconTile}>
            <KindIcon size={15} />
          </span>
          <span style={s.title}>{t(`sections.${kind}`)}</span>
          <span aria-hidden="true" style={s.chevron(open)}>
            <Icon.ChevronDown size={16} />
          </span>
        </button>
      </h2>
      <div id={bodyId} hidden={!open} style={s.body}>
        {children}
      </div>
    </section>
  );
}
