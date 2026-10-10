/* EvalRunButton — "Run all evals (N cases)" on the Evals tab, "Run eval (N
   cases)" on the dashboard detail (SPEC-04). While a suite run of the agent is
   running it reads "Running k / N cases" and is disabled; while a single-case
   run is running (SPEC-07) it reads "Running case…" and is disabled too; with
   no cases it is disabled. A refused start (409 / 422 / 429) becomes one mapped toast —
   the mapping lives in `useStartEvalRun`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { useStartEvalRun } from "@/lib/hooks/eval";

interface Props {
  agentId: string;
  /** The agent's current number of eval cases. */
  caseCount: number;
  variant: "tab" | "dashboard";
  /** The agent's run that is `running` right now, of either scope, if any. */
  runningRun?: EvalSuiteRun | null;
}

export function EvalRunButton({ agentId, caseCount, variant, runningRun }: Props) {
  const t = useTranslations("eval");
  const start = useStartEvalRun(agentId);
  // The click lands before React re-renders with `isPending`; the ref keeps a
  // double click from starting two runs.
  const inFlight = React.useRef(false);

  const running = !!runningRun;
  const label = runningRun
    ? runningRun.scope === "case"
      ? t("runButton.runningCase")
      : t("runButton.running", { done: runningRun.cases_done, total: runningRun.cases_total })
    : t(variant === "tab" ? "runButton.tab" : "runButton.dashboard", { count: caseCount });

  return (
    <Button
      kind={variant === "tab" ? "secondary" : "primary"}
      size="sm"
      icon="Play"
      loading={running}
      disabled={running || caseCount === 0 || start.isPending}
      onClick={() => {
        if (inFlight.current) return;
        inFlight.current = true;
        start.mutate(undefined, { onSettled: () => (inFlight.current = false) });
      }}
    >
      {label}
    </Button>
  );
}
