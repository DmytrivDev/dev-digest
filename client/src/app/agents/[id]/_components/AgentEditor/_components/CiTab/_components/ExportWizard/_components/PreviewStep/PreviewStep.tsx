/* Step 2 — Preview (AC-9): "FILES TO CREATE" beside a path header and a code
   view. Only the workflow is editable; runner files (contents === null) show
   their size instead of code. The selection is a path in state; the file itself
   is derived from the preview on every render. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Textarea } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { formatBytes, workflowOf } from "../../helpers";
import { s } from "../../styles";

export function PreviewStep({
  files,
  editedWorkflow,
  onEdit,
  replacedNotice,
}: {
  files: readonly CiFile[];
  editedWorkflow: string | null;
  onEdit: (contents: string) => void;
  replacedNotice: boolean;
}) {
  const t = useTranslations("ci");
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const selected = files.find((f) => f.path === selectedPath) ?? workflowOf(files) ?? files[0];

  return (
    <>
      {replacedNotice && (
        <div role="status" style={s.notice}>
          {t("exportWizard.configure.replacedNotice")}
        </div>
      )}
      <div style={s.split}>
        <div style={s.fileList}>
          <div style={s.fileListLabel}>{t("exportWizard.preview.filesToCreate")}</div>
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              className="mono"
              aria-current={f === selected}
              onClick={() => setSelectedPath(f.path)}
              style={s.fileItem(f === selected)}
            >
              <Icon.FileText size={13} style={s.fileIcon} />
              {f.path}
            </button>
          ))}
        </div>
        {selected && (
          <div style={s.pane}>
            <div style={s.paneHead}>
              <span className="mono" style={s.panePath}>
                {selected.path}
              </span>
              {selected.editable ? (
                <Badge icon="Edit">{t("exportWizard.preview.editable")}</Badge>
              ) : (
                <Badge icon="Lock">{t("exportWizard.preview.readOnly")}</Badge>
              )}
            </div>
            <div style={s.paneBody}>
              {selected.editable ? (
                <Textarea
                  mono
                  rows={16}
                  value={editedWorkflow ?? selected.contents ?? ""}
                  onChange={onEdit}
                />
              ) : selected.contents === null ? (
                <div style={s.runnerNote}>
                  {t("exportWizard.preview.runnerFile", { size: formatBytes(selected.size_bytes) })}
                </div>
              ) : (
                <pre className="mono" style={s.code}>
                  {selected.contents}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
