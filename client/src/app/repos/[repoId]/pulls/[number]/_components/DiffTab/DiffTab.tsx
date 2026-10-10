"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, SEV } from "@devdigest/ui";
import {
  DiffViewer,
  type DiffCommentApi,
  type DiffAnnotation,
  type DiffFileBadge,
  type DiffFocus,
} from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { usePrBrief } from "@/lib/hooks/brief";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { riskColor, riskIconName } from "../RiskAreas";
import { SmartDiffGroup } from "./_components/SmartDiffGroup";
import { BriefNote } from "./_components/BriefNote";
import { ROLE_META, FINDING_LABEL_KEY, COLLAPSED_BY_DEFAULT } from "./constants";
import {
  selectLatestReview,
  groupFilesByRole,
  filesWithFindings,
  markedPaths,
  sortFindingsForDiff,
  briefLineNotes,
  briefFileCounts,
  resolveDiffFocus,
  bucketHasFocus,
} from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** Deep-link target from `?file=&line=` (see `parseDiffTarget`). A target that
      names no file of this PR is ignored, so the tab renders as without one. */
  focus?: DiffFocus | null;
}

export function DiffTab({ prId, filesCount, files, canComment, focus }: DiffTabProps) {
  const t = useTranslations("prReview");
  const tb = useTranslations("brief");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const { data: briefEnvelope } = usePrBrief(prId);
  const action = useFindingAction();

  // Findings in the diff are the point of Smart Diff, so comments AND
  // findings now start VISIBLE — one toggle hides both.
  const [showNotes, setShowNotes] = React.useState(true);
  const [order, setOrder] = React.useState<"smart" | "original">("smart");

  const commentCount = comments?.length ?? 0;
  const latestReview = selectLatestReview(reviews ?? []);
  const findingsCount = latestReview?.findings.length ?? 0;
  // The PR Brief's risk areas and review-focus lines, marked on their rows like findings.
  const briefNotes = briefLineNotes(briefEnvelope?.brief, files);
  const noteCount = commentCount + findingsCount + briefNotes.length;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments: showNotes,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowNotes(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  // NOT memoized: the FindingCard content wired in here reads the mutation's
  // live `isPending`/`variables` on every render, so Accept/Dismiss show a
  // pending state and can't double-POST. A memo keyed on [latestReview, t]
  // would freeze that wiring at whatever `action` looked like on the render
  // that built the cache entry.
  const annotationItems: DiffAnnotation[] = latestReview
    ? sortFindingsForDiff(latestReview.findings).map((f) => {
        const key = FINDING_LABEL_KEY[f.severity] ?? "suggestion";
        const sevToken = SEV[f.severity as keyof typeof SEV] ?? SEV.SUGGESTION;
        return {
          id: f.id,
          path: f.file,
          line: f.start_line,
          color: sevToken.c,
          icon: sevToken.icon,
          label: t(`smartDiff.findingLabel.${key}`),
          content: (
            <FindingCard
              f={f}
              defaultExpanded
              agentId={latestReview.agent_id}
              prId={prId ?? undefined}
              onAction={(act) => (prId ? action.mutate({ findingId: f.id, action: act, prId }) : undefined)}
              pending={action.isPending && action.variables?.findingId === f.id}
            />
          ),
        };
      })
    : [];

  // After the findings: a finding at the same line keeps the row's stripe and label.
  const briefItems: DiffAnnotation[] = briefNotes.map((n) => {
    const color = n.kind === "risk" ? riskColor(n.severity ?? "") : "var(--accent)";
    const icon = n.kind === "risk" ? riskIconName(n.riskKind ?? "") : "ListChecks";
    return {
      id: n.id,
      path: n.path,
      line: n.line,
      color,
      icon,
      label: tb(n.kind === "risk" ? "diff.riskLabel" : "diff.focusLabel"),
      content: <BriefNote note={n} color={color} icon={icon} />,
    };
  });

  // The file header counts what the brief pins in that file: risks (in the colour of the
  // highest severity) and review-focus items.
  const badges = new Map<string, DiffFileBadge[]>();
  for (const [path, c] of briefFileCounts(briefNotes)) {
    const list: DiffFileBadge[] = [];
    if (c.risks > 0) {
      list.push({
        id: "brief-risks",
        icon: "AlertTriangle",
        color: riskColor(c.severity ?? ""),
        count: c.risks,
        label: tb("diff.riskBadge", { count: c.risks }),
      });
    }
    if (c.focus > 0) {
      list.push({
        id: "brief-focus",
        icon: "ListChecks",
        color: "var(--accent)",
        count: c.focus,
        label: tb("diff.focusBadge", { count: c.focus }),
      });
    }
    badges.set(path, list);
  }

  const marks = smartDiff
    ? { paths: markedPaths(smartDiff), label: t("smartDiff.fileHasFindings") }
    : undefined;
  const annotations = { items: [...annotationItems, ...briefItems], visible: showNotes };

  const buckets = order === "smart" && smartDiff ? groupFilesByRole(smartDiff, files) : null;
  const effectiveFocus = resolveDiffFocus(focus, files);

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.actionsRow}>
            {noteCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showNotes ? "EyeOff" : "Eye"}
                onClick={() => setShowNotes((v) => !v)}
              >
                {t(showNotes ? "smartDiff.hideNotes" : "smartDiff.showNotes", { count: noteCount })}
              </Button>
            )}
            {smartDiff && (
              <div style={s.toggleGroup}>
                <Button
                  kind="ghost"
                  size="sm"
                  active={order === "smart"}
                  onClick={() => setOrder("smart")}
                >
                  {t("smartDiff.orderSmart")}
                </Button>
                <Button
                  kind="ghost"
                  size="sm"
                  active={order === "original"}
                  onClick={() => setOrder("original")}
                >
                  {t("smartDiff.orderOriginal")}
                </Button>
              </div>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>

      {buckets ? (
        <div style={s.groupWrap}>
          {buckets.map((bucket, i) => {
            const meta = ROLE_META[bucket.role];
            const hasTarget = bucketHasFocus(bucket, effectiveFocus);
            return (
              <SmartDiffGroup
                // The target's group must open even when its role collapses by
                // default; the key remounts the group if the target changes.
                key={`${bucket.role}:${hasTarget ? effectiveFocus?.path : ""}`}
                label={t(`smartDiff.${meta.labelKey}`)}
                hint={t(`smartDiff.${meta.hintKey}`)}
                color={meta.color}
                filesCount={bucket.files.length}
                filesWithFindings={latestReview ? filesWithFindings(bucket, smartDiff!) : null}
                defaultOpen={hasTarget || !COLLAPSED_BY_DEFAULT.includes(bucket.role)}
                showReviewNotRun={i === 0}
              >
                <DiffViewer
                  files={bucket.files}
                  commenting={commenting}
                  annotations={annotations}
                  marks={marks}
                  badges={badges}
                  focus={effectiveFocus}
                />
              </SmartDiffGroup>
            );
          })}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} annotations={annotations} marks={marks} badges={badges} focus={effectiveFocus} />
      )}
    </section>
  );
}
