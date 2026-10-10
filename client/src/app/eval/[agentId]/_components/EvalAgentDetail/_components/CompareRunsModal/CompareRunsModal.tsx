/* CompareRunsModal — opened from "Compare" on /eval/[agentId] (AC-98…102).

   The server decides which run is "old" (the one that started earlier) and
   recomputes the three metrics over the cases both runs contain; this modal
   only lays that answer out (see CompareBody). Close is the only footer
   action — there is no Promote (AC-102). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useEvalCompare } from "@/lib/hooks/eval";
import { compareErrorKey } from "@/lib/eval";
import { CompareBody } from "./_components/CompareBody";
import { s } from "./styles";

interface Props {
  runAId: string;
  runBId: string;
  onClose: () => void;
}

export function CompareRunsModal({ runAId, runBId, onClose }: Props) {
  const t = useTranslations("eval");
  const { data, isLoading, isError, error } = useEvalCompare(runAId, runBId);

  return (
    <Modal
      width={920}
      title={
        data
          ? t("compare.title", { old: data.old.agent_version, new: data.new.agent_version })
          : t("detail.compare")
      }
      subtitle={data ? t("compare.subtitle", { count: data.common_case_ids.length }) : undefined}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {t("compare.close")}
          </Button>
        </div>
      }
    >
      {isLoading && <div style={s.state}>{t("compare.loading")}</div>}
      {isError && (
        <div role="alert" style={s.state}>
          {t(compareErrorKey(error))}
        </div>
      )}
      {data && <CompareBody data={data} />}
    </Modal>
  );
}
