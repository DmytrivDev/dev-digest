/* ConfirmDialog — the app's own confirmation for a destructive action.

   Replaces window.confirm, which is a browser chrome dialog: it cannot be
   styled, it has no close affordance beyond OK/Cancel, and under jsdom it
   returns undefined unless every test stubs it. This renders the same three
   ways out the native box implies — confirm, cancel, dismiss (the X or the
   backdrop) — as real DOM, so they are testable and look like the product.

   Deliberately uncontrolled about WHAT it confirms: the caller owns the
   mutation and passes the copy, so one dialog serves skills, agents and
   versions without learning any of them. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

const DIALOG_WIDTH = 460;

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  kind = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: React.ReactNode;
  body: React.ReactNode;
  confirmLabel: string;
  /** "danger" for a delete; "primary" for a reversible action such as restore. */
  kind?: "danger" | "primary";
  /** While the mutation is in flight: both buttons and every exit are locked. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("common");
  return (
    <Modal
      width={DIALOG_WIDTH}
      title={title}
      // No X and no backdrop dismiss while the mutation runs — closing then
      // would hide an action that is still going to happen.
      onClose={busy ? undefined : onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onCancel} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button kind={kind} onClick={onConfirm} disabled={busy} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={s.body}>{body}</div>
    </Modal>
  );
}
