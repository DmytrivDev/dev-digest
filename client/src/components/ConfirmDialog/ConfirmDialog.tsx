/* ConfirmDialog — the app's own confirmation for a destructive action.

   Replaces window.confirm, which is a browser chrome dialog: it cannot be
   styled, it has no close affordance beyond OK/Cancel, and under jsdom it
   returns undefined unless every test stubs it. This renders the same three
   ways out the native box implies — confirm, cancel, dismiss (the X or the
   backdrop) — as real DOM, so they are testable and look like the product.

   Deliberately uncontrolled about WHAT it confirms: the caller owns the
   mutation and passes the copy, so one dialog serves skills, agents and
   versions without learning any of them.

   It renders through a PORTAL to <body>, which is not a detail. Callers open it
   from inside the card whose row is being deleted, and a disabled card sets
   `opacity: 0.6` on itself — opacity applies to the whole subtree, so a dialog
   nested in that card came out half transparent over the page.

   The portal fixes the painting and NOT the clicking: React re-dispatches
   events along the COMPONENT tree, so a click inside a portal still bubbles to
   the JSX parent that rendered it — the clickable card. That is why the
   content is wrapped in a stop-propagation boundary here rather than at each
   call site: both hazards come from the same place, so the dialog should be
   the one that knows about them. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
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
  // SSR has no document; the dialog only ever opens from a user action, so
  // rendering nothing on the server is correct rather than a workaround.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    // Not a layout wrapper: it stops the click from reaching the card that
    // rendered this dialog (see the header — React portals bubble by tree).
    <div onClick={(e) => e.stopPropagation()}>
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
    </div>,
    document.body,
  );
}
