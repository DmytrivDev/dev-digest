"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { BriefFileRef, splitRef, type BriefNav } from "../../../BriefFileRef";
import { riskColor, riskIconName } from "../../helpers";
import { s } from "./styles";

interface RiskPillProps {
  risk: Risk;
  nav: BriefNav;
}

/**
 * One risk as a bordered pill — kind icon (coloured by severity), title, the first
 * file reference and a chevron. The chevron toggles a panel with the explanation
 * and every reference. All model text renders as plain text (never markdown).
 */
export function RiskPill({ risk, nav }: RiskPillProps) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const color = riskColor(risk.severity);
  const KindIcon = Icon[riskIconName(risk.kind)];
  const first = risk.file_refs[0];

  return (
    <div style={s.wrap}>
      <div style={s.pill(open, color)}>
        <div style={s.body}>
          <div style={s.titleRow}>
            <KindIcon size={13} style={{ color, flexShrink: 0 }} />
            <span>{risk.title}</span>
          </div>
          {first && <RefLink value={first} nav={nav} />}
        </div>
        <button
          type="button"
          style={s.chevron}
          aria-expanded={open}
          aria-label={open ? t("risks.collapse") : t("risks.expand")}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon.ChevronDown size={15} style={s.chevronIcon(open)} />
        </button>
      </div>
      {open && (
        <div style={s.panel}>
          <p style={s.explanation}>{risk.explanation}</p>
          {risk.file_refs.length > 0 && (
            <div style={s.refs}>
              {risk.file_refs.map((ref, i) => (
                <RefLink key={`${ref}:${i}`} value={ref} nav={nav} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RefLink({ value, nav }: { value: string; nav: BriefNav }) {
  const { path, line } = splitRef(value);
  return <BriefFileRef path={path} line={line} label={value} nav={nav} />;
}
