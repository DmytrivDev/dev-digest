/* CandidateCard — one convention candidate, with its evidence and its triage.

   The evidence is the point of the whole feature, so it is rendered as a
   clickable permalink pinned to the sha the scan ran against. `evidence_url` is
   null when the server could not resolve a head at scan time; that case prints
   `path:line` as plain text rather than a link that goes nowhere. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, MonoLink, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory, ConventionStatus } from "@devdigest/shared";
import { CONFIDENCE_BAR_WIDTH, HIGH_CONFIDENCE } from "./constants";
import { s } from "./styles";
import { CandidateEditForm } from "./_components/CandidateEditForm";

export function CandidateCard({
  candidate,
  busy,
  onTriage,
  onSaveEdit,
}: {
  candidate: ConventionCandidate;
  /** A mutation for THIS candidate is in flight. */
  busy?: boolean;
  onTriage: (status: ConventionStatus) => void;
  onSaveEdit: (patch: { rule: string; category: ConventionCategory }) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);

  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";
  const pct = Math.round(candidate.confidence * 100);
  const evidenceLabel = `${candidate.evidence_path}:${candidate.evidence_line}`;

  return (
    <div style={s.card(candidate.status)}>
      <div style={s.row}>
        <div style={s.main}>
          <div style={s.tags}>
            <Badge>{t(`category.${candidate.category}`)}</Badge>
            {accepted && (
              <Badge color="var(--ok)" bg="var(--ok-bg, #052e1c)" icon="Check">
                {t("card.accepted")}
              </Badge>
            )}
            {rejected && (
              <Badge color="var(--text-muted)" icon="X">
                {t("card.rejected")}
              </Badge>
            )}
          </div>

          {editing ? (
            <CandidateEditForm
              rule={candidate.rule}
              category={candidate.category}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={(patch) => {
                onSaveEdit(patch);
                setEditing(false);
              }}
            />
          ) : (
            <div style={s.rule}>{candidate.rule}</div>
          )}

          <div style={s.evidence}>
            <div style={s.evidenceHead}>
              {candidate.evidence_url ? (
                <MonoLink href={candidate.evidence_url}>{evidenceLabel}</MonoLink>
              ) : (
                <span className="mono" style={s.evidenceText} title={t("card.evidenceNoLink")}>
                  {evidenceLabel}
                </span>
              )}
            </div>
            <pre className="mono" style={s.snippet}>
              {candidate.evidence_snippet}
            </pre>
          </div>

          <div style={s.confidence}>
            <span style={s.confidenceLabel}>{t("card.confidence")}</span>
            <div style={{ width: CONFIDENCE_BAR_WIDTH }}>
              <ProgressBar
                value={pct}
                height={5}
                color={candidate.confidence >= HIGH_CONFIDENCE ? "var(--ok)" : "var(--warn)"}
              />
            </div>
            <span className="mono tnum" style={s.confidenceValue}>
              {pct}%
            </span>
          </div>
        </div>

        {!editing && (
          <div style={s.actions}>
            <Button
              kind={accepted ? "primary" : "secondary"}
              size="sm"
              icon={accepted ? "Check" : "Plus"}
              full
              disabled={accepted || busy}
              onClick={() => onTriage("accepted")}
            >
              {accepted ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button
              kind={rejected ? "danger" : "ghost"}
              size="sm"
              icon="X"
              full
              disabled={rejected || busy}
              onClick={() => onTriage("rejected")}
            >
              {rejected ? t("card.rejected") : t("card.reject")}
            </Button>
            <Button kind="ghost" size="sm" icon="Edit" full onClick={() => setEditing(true)}>
              {t("card.edit")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
