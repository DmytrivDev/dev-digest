/* RunReviewDropdown — ported from components2.jsx, reworked for SPEC-08.
   Opens the "Pick agents to run" panel; one click starts ONE multi-agent run
   (POST /pulls/:id/multi-agent-run) and navigates to /multi-agent/<id>. The
   resulting runIds are still handed up so the parent can stream SSE status. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useStartMultiAgentRun } from "@/lib/hooks/multi-agent";
import { DROPDOWN_WIDTH } from "./constants";
import { PickerPanel } from "./_components/PickerPanel";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents } = useAgents();
  const start = useStartMultiAgentRun();
  // Guards a double click that lands before `isPending` re-renders the button.
  const inFlight = React.useRef(false);

  const kick = async (agentIds: string[]) => {
    if (inFlight.current) return;
    inFlight.current = true;
    onRunStart?.();
    try {
      const res = await start.mutateAsync({ prId, agentIds });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
      router.push(`/multi-agent/${res.id}`);
    } catch {
      // The global mutation error toast reports it; stay on the page.
    } finally {
      inFlight.current = false;
      onRunSettled?.();
    }
  };

  return (
    <Dropdown
      width={DROPDOWN_WIDTH}
      align="right"
      trigger={
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={warnMerged ? { opacity: 0.6 } : undefined}
        >
          <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={start.isPending}>
            {start.isPending ? t("runReview.running") : t("runReview.runReview")}
          </Button>
        </span>
      }
    >
      {agents && (
        <PickerPanel agents={agents} warnMerged={warnMerged} pending={start.isPending} onRun={kick} />
      )}
    </Dropdown>
  );
}
