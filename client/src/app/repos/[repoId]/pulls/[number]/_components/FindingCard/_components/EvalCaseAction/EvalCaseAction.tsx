/* EvalCaseAction — the eval-suite slot after Dismiss on a FindingCard (SPEC-04).
   Hidden for an untriaged or agent-less finding, a disabled button with a
   tooltip when the agent is gone, otherwise "Turn into eval case" — which
   becomes "In eval suite" (a link to the case in the agent's Evals tab) once
   the case exists. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useCreateEvalCase } from "@/lib/hooks/eval";
import { evalActionState } from "./helpers";
import { s } from "./styles";

interface Props {
  finding: FindingRecord;
  /** The review's agent; the target of the "In eval suite" link. */
  agentId: string | null;
  /** Lets the new case id be written into the cached PR reviews. */
  prId?: string;
}

export function EvalCaseAction({ finding, agentId, prId }: Props) {
  const t = useTranslations("prReview");
  const state = evalActionState(finding);

  if (state === "hidden") return null;
  if (state === "agentMissing") {
    return (
      <span title={t("finding.evalCase.agentMissing")} style={s.tooltipWrap}>
        <Button kind="ghost" size="sm" icon="FlaskConical" disabled>
          {t("finding.evalCase.turnInto")}
        </Button>
      </span>
    );
  }
  return <EvalCaseButton finding={finding} agentId={agentId} prId={prId} />;
}

/** Mounted only when the action is available, so a card that never offers it
    needs neither the query client nor the router. */
function EvalCaseButton({ finding, agentId, prId }: Props) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const create = useCreateEvalCase(prId);
  // A click lands before React re-renders with `isPending`, so a double click
  // would otherwise start two requests; the ref closes that window.
  const inFlight = React.useRef(false);

  const caseId = finding.eval_case_id ?? create.data?.id ?? null;
  const targetAgentId = agentId ?? create.data?.agent_id ?? null;

  if (caseId) {
    return (
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!targetAgentId}
        onClick={() =>
          router.push(
            `/agents/${encodeURIComponent(targetAgentId ?? "")}?tab=evals&case=${encodeURIComponent(caseId)}`,
          )
        }
      >
        {t("finding.evalCase.inSuite")}
      </Button>
    );
  }

  return (
    <Button
      kind="ghost"
      size="sm"
      icon="FlaskConical"
      disabled={create.isPending}
      onClick={() => {
        if (inFlight.current) return;
        inFlight.current = true;
        create.mutate(finding.id, { onSettled: () => (inFlight.current = false) });
      }}
    >
      {t("finding.evalCase.turnInto")}
    </Button>
  );
}
