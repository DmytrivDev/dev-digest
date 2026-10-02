/* DocPreviewModal — a document's rendered text in a dialog (AC-36). The text is
   somebody else's, so it goes through <Markdown untrusted>: no raw HTML and no
   <img> that would call a remote host. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown, Modal } from "@devdigest/ui";
import { useContextDoc } from "@/lib/hooks/core";
import { s } from "./styles";

export function DocPreviewModal({
  repoId,
  path,
  onClose,
}: {
  repoId: string;
  path: string;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const doc = useContextDoc(repoId, path);
  return (
    <Modal title={<span className="mono">{t("picker.previewTitle", { path })}</span>} onClose={onClose}>
      <div style={s.body}>
        {doc.isLoading ? (
          <span style={s.muted}>{t("preview.loading")}</span>
        ) : doc.isError ? (
          <span role="alert" style={s.error}>
            {doc.error instanceof Error && doc.error.message ? doc.error.message : t("preview.loadError")}
          </span>
        ) : (
          <Markdown untrusted>{doc.data?.content}</Markdown>
        )}
      </div>
    </Modal>
  );
}
