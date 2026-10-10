/* DetailHeader — the top of /eval/[agentId]: an "All agents" back link, the
   agent's name with its model, the "Regression harness · R runs on the N-case
   set" subtitle, the link to the agent's Evals tab and the run button (AC-81). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { EvalRunButton } from "@/components/EvalRunButton";
import { s } from "./styles";

interface Props {
  agent: { id: string; name: string; model: string };
  runCount: number;
  caseCount: number;
  runningRun: EvalSuiteRun | null;
}

export function DetailHeader({ agent, runCount, caseCount, runningRun }: Props) {
  const t = useTranslations("eval");
  return (
    <>
      <Link href="/eval" style={s.back}>
        <Icon.ChevronLeft size={14} />
        {t("detail.allAgents")}
      </Link>
      <div style={s.header}>
        <div style={s.titleBlock}>
          <div style={s.titleRow}>
            <h1 style={s.h1}>{agent.name}</h1>
            <Badge color="var(--text-secondary)" mono>
              {agent.model}
            </Badge>
          </div>
          <p style={s.subtitle}>{t("detail.subtitle", { runs: runCount, cases: caseCount })}</p>
        </div>
        <div style={s.actions}>
          <Link href={`/agents/${agent.id}?tab=evals`} className="mono" style={s.configure}>
            {t("detail.configure")}
          </Link>
          <EvalRunButton
            agentId={agent.id}
            caseCount={caseCount}
            variant="dashboard"
            runningRun={runningRun}
          />
        </div>
      </div>
    </>
  );
}
