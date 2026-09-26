"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import { callerHref } from "../../helpers";
import { s } from "../../styles";

interface BlastTreeProps {
  downstream: DownstreamImpact[];
  repoFullName: string | null | undefined;
  indexedSha: string | undefined;
  headSha: string | null | undefined;
}

/** One collapsible row per changed symbol with at least one caller. The
 *  first group is open by default; the rest toggle independently. */
export function BlastTree({ downstream, repoFullName, indexedSha, headSha }: BlastTreeProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState<Record<string, boolean>>(() =>
    downstream.length > 0 ? { [downstream[0]!.symbol]: true } : {},
  );

  return (
    <div>
      {downstream.map((group) => {
        const isOpen = !!open[group.symbol];
        return (
          <div key={group.symbol} style={s.treeGroup}>
            <button
              type="button"
              aria-expanded={isOpen}
              style={s.groupHeader}
              onClick={() => setOpen((prev) => ({ ...prev, [group.symbol]: !prev[group.symbol] }))}
            >
              {isOpen ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
              <Icon.Code size={14} style={s.groupIcon} />
              <span className="mono" style={s.groupSymbol}>{`${group.symbol}()`}</span>
              <span style={s.groupCount}>
                {t("callerCount", { count: group.callers.length })}
              </span>
            </button>

            {isOpen && (
              <>
                <div style={s.callerList}>
                  {group.callers.map((caller) => {
                    const href = callerHref(repoFullName, indexedSha, headSha, caller.file, caller.line);
                    return (
                      <div key={`${caller.file}:${caller.line}`} style={s.callerRow}>
                        <Icon.CornerDownRight size={13} style={s.callerIcon} />
                        {href ? (
                          <MonoLink href={href}>{`${caller.file}:${caller.line}`}</MonoLink>
                        ) : (
                          <span className="mono" style={s.callerText}>
                            {`${caller.file}:${caller.line}`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {group.endpoints_affected.length > 0 && (
                  <div style={s.chipRow}>
                    {group.endpoints_affected.map((e) => (
                      <Badge key={e} mono icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)">
                        {e}
                      </Badge>
                    ))}
                  </div>
                )}
                {group.crons_affected.length > 0 && (
                  <div style={s.chipRow}>
                    {group.crons_affected.map((c) => (
                      <Badge key={c} mono icon="Clock" color="var(--warn)" bg="var(--warn-bg)">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
