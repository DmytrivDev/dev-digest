/* VersionsTab — the skill's body snapshots: what each version said, how it
   differs from the body in the editor now, and restoring one.

   Restore writes the old text FORWARD as a new version (the server does this),
   so the history is append-only and a run that cited v3 stays explainable. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { diffLines, hasChanges } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<SkillVersion | null>(null);
  const [restoreOf, setRestoreOf] = React.useState<SkillVersion | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    );
  }
  if (isError) return <ErrorState title={t("versions.loadError")} />;

  const versions = data ?? [];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <Badge color="var(--text-secondary)">
          {t("versions.count", { count: versions.length })}
        </Badge>
      </div>
      <p style={s.hint}>{t("versions.hint")}</p>

      {versions.length === 0 ? (
        <span style={s.empty}>{t("versions.empty")}</span>
      ) : (
        <div style={s.list}>
          {versions.map((v) => {
            // "Current" is the version the SKILL row is on, not simply the
            // newest snapshot: a metadata-only edit leaves the body untouched
            // and writes no snapshot, so the two can only be compared by number.
            const current = v.version === skill.version;
            return (
              <div key={v.version} style={s.row(current)}>
                <span className="mono" style={s.chip(current)}>
                  v{v.version}
                </span>
                <div style={s.rowMain}>
                  <div style={s.note}>
                    {current ? t("versions.currentNote") : t("versions.savedNote")}
                  </div>
                  <div style={s.date}>{new Date(v.created_at).toLocaleString("en-US")}</div>
                </div>
                {current ? (
                  <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                    {t("versions.current")}
                  </Badge>
                ) : (
                  <div style={s.actions}>
                    <Button kind="ghost" size="sm" icon="Eye" onClick={() => setDiffOf(v)}>
                      {t("versions.diff")}
                    </Button>
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="History"
                      disabled={restore.isPending}
                      onClick={() => setRestoreOf(v)}
                    >
                      {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {restoreOf && (
        <ConfirmDialog
          kind="primary"
          title={t("versions.restoreTitle", { version: restoreOf.version })}
          body={t("versions.restoreBody")}
          confirmLabel={t("versions.restoreCta")}
          busy={restore.isPending}
          onCancel={() => setRestoreOf(null)}
          onConfirm={() =>
            restore.mutate(
              { id: skill.id, version: restoreOf.version },
              { onSuccess: () => setRestoreOf(null) },
            )
          }
        />
      )}

      {diffOf && (
        <Modal
          width={900}
          title={t("versions.diffTitle", { version: diffOf.version })}
          onClose={() => setDiffOf(null)}
        >
          <VersionDiff before={diffOf.body} after={skill.body} empty={t("versions.noChanges")} />
        </Modal>
      )}
    </div>
  );
}

/** The snapshot on the left of the arrow, the editor's current body on the right. */
function VersionDiff({
  before,
  after,
  empty,
}: {
  before: string;
  after: string;
  empty: string;
}) {
  const lines = React.useMemo(() => diffLines(before, after), [before, after]);
  if (!hasChanges(lines)) return <span style={s.diffNone}>{empty}</span>;
  return (
    <pre className="mono" style={s.diffPre}>
      {lines.map((l, i) => (
        <span key={i} style={s.diffLine(l.kind)}>
          {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
          {l.text}
        </span>
      ))}
    </pre>
  );
}
