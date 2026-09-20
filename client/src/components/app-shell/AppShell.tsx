/* AppShell.tsx — thin orchestrator: wires @devdigest/ui AppFrame to the command
   palette, shortcuts help, global keyboard shortcuts, and the shell context.
   All concerns live in ./hooks; overlay open/close is local view state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AppFrame, CommandPalette, ShortcutsHelp, type Crumb } from "@devdigest/ui";
import { ConfirmDialog } from "../ConfirmDialog";
import { useGlobalShortcuts, useShellCommands, useShellContext } from "./hooks";

export function AppShell({ children, crumb }: { children: React.ReactNode; crumb?: Crumb[] }) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const openPalette = React.useCallback(() => setPaletteOpen(true), []);
  const closePalette = React.useCallback(() => setPaletteOpen(false), []);
  const openHelp = React.useCallback(() => setHelpOpen(true), []);
  const closeHelp = React.useCallback(() => setHelpOpen(false), []);

  useGlobalShortcuts({ onOpenPalette: openPalette, onOpenHelp: openHelp });
  const t = useTranslations("shell");
  const commands = useShellCommands();
  const { ctx, repoPendingRemoval, confirmRemoveRepo, cancelRemoveRepo, removing } =
    useShellContext({ onOpenCommandPalette: openPalette });

  return (
    <>
      <AppFrame ctx={ctx} crumb={crumb}>
        {children}
      </AppFrame>
      <CommandPalette open={paletteOpen} commands={commands} onClose={closePalette} />
      <ShortcutsHelp open={helpOpen} onClose={closeHelp} />
      {repoPendingRemoval && (
        <ConfirmDialog
          title={t("removeRepo.title", { name: repoPendingRemoval.name })}
          body={t("removeRepo.body")}
          confirmLabel={t("removeRepo.cta")}
          busy={removing}
          onCancel={cancelRemoveRepo}
          onConfirm={confirmRemoveRepo}
        />
      )}
    </>
  );
}
