"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { usePrHistory } from "@/lib/hooks/blast";
import { PriorPrsList } from "./_components/PriorPrsList";
import { s } from "./styles";

interface PriorPrsProps {
  prId: string | null | undefined;
  repoFullName: string | null | undefined;
}

/**
 * "Prior PRs touching these files" — collapsed by default. The query is
 * `enabled` only while `open`, so it fires lazily; the count badge is read
 * straight off the query result (never copied into its own state — a query
 * result copied into `useState` silently stops receiving updates).
 */
export function PriorPrs({ prId, repoFullName }: PriorPrsProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);
  const { data, isLoading } = usePrHistory(prId, { enabled: open });

  return (
    <div style={s.priorPrsWrap}>
      <button
        type="button"
        aria-expanded={open}
        style={s.priorPrsHeader}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
        <Icon.History size={14} style={s.priorPrsIcon} />
        <span>{t("history.title")}</span>
        {data && <Badge>{data.history.length}</Badge>}
      </button>
      {open && <PriorPrsList data={data} isLoading={isLoading} repoFullName={repoFullName} />}
    </div>
  );
}
