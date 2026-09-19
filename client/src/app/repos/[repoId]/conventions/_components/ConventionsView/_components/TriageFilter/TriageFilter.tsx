/* TriageFilter — All / Pending / Accepted / Rejected, with counts.

   The rejected view is not decoration: a rejected candidate is KEPT server-side
   so a later scan cannot resurrect it, and a page that simply hid it would give
   the user no way to see that, or to change their mind. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip } from "@devdigest/ui";
import { FILTER_ICON, FILTER_KEYS, type FilterKey } from "../../constants";
import { s } from "./styles";

export function TriageFilter({
  active,
  counts,
  onChange,
}: {
  active: FilterKey;
  counts: Record<FilterKey, number>;
  onChange: (key: FilterKey) => void;
}) {
  const t = useTranslations("conventions");
  return (
    <div style={s.row}>
      {FILTER_KEYS.map((key) => (
        <Chip
          key={key}
          icon={FILTER_ICON[key]}
          active={key === active}
          count={counts[key]}
          onClick={() => onChange(key)}
        >
          {t(`filter.${key}`)}
        </Chip>
      ))}
    </div>
  );
}
