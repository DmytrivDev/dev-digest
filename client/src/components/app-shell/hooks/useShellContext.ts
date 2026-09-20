"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ShellContext } from "@devdigest/ui";
import { useTheme } from "../../../lib/theme";
import { useActiveRepo } from "../../../lib/repo-context";
import { usePulls, useDeleteRepo } from "@/lib/hooks/core";
import { activeKeyFor, toShellRepo } from "../helpers";

interface ShellContextOptions {
  onOpenCommandPalette: () => void;
}

/**
 * What AppShell needs: the `ShellContext` AppFrame consumes, plus the pending
 * repo removal.
 *
 * The removal is returned rather than handled here because a confirmation is a
 * rendered dialog now, and a hook has nowhere to render it. The hook owns which
 * repo was asked about; the shell owns the asking.
 */
export interface ShellContextBundle {
  ctx: ShellContext;
  /** The repo a removal was requested for, resolved for the dialog's copy. */
  repoPendingRemoval: { id: string; name: string } | null;
  confirmRemoveRepo: () => void;
  cancelRemoveRepo: () => void;
  removing: boolean;
}

/**
 * Assembles the `ShellContext` consumed by AppFrame: active nav key, the repo
 * list/active repo (mapped to the shell shape), theme, PR count, and the repo
 * selection / add / removal actions.
 */
export function useShellContext({ onOpenCommandPalette }: ShellContextOptions): ShellContextBundle {
  const t = useTranslations("shell");
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { repoId, repos, activeRepo, setRepoId } = useActiveRepo();
  const { data: pulls } = usePulls(repoId);
  const deleteRepo = useDeleteRepo();

  const onSelectRepo = React.useCallback(
    (id: string) => {
      setRepoId(id);
      router.push(`/repos/${id}/pulls`);
    },
    [setRepoId, router],
  );

  const onAddRepo = React.useCallback(() => router.push("/onboarding"), [router]);

  const [pendingRemovalId, setPendingRemovalId] = React.useState<string | null>(null);
  const onRemoveRepo = React.useCallback((id: string) => setPendingRemovalId(id), []);

  const repoPendingRemoval = React.useMemo(() => {
    if (!pendingRemovalId) return null;
    const target = repos.find((r) => r.id === pendingRemovalId);
    return { id: pendingRemovalId, name: target?.full_name ?? t("removeRepo.fallbackName") };
  }, [pendingRemovalId, repos, t]);

  const cancelRemoveRepo = React.useCallback(() => setPendingRemovalId(null), []);

  const confirmRemoveRepo = React.useCallback(() => {
    if (!pendingRemovalId) return;
    const id = pendingRemovalId;
    deleteRepo.mutate(id, {
      onSuccess: () => {
        // Leaving the route of a repo that no longer exists would land on the
        // shared not-found screen, so move to a sibling first.
        if (repoId === id) {
          const next = repos.find((r) => r.id !== id);
          router.push(next ? `/repos/${next.id}/pulls` : "/onboarding");
        }
      },
      onSettled: () => setPendingRemovalId(null),
    });
  }, [pendingRemovalId, repos, repoId, deleteRepo, router]);

  const ctx = React.useMemo<ShellContext>(
    () => ({
      Link,
      activeKey: activeKeyFor(pathname),
      repoId,
      repos: repos.map(toShellRepo),
      activeRepo: activeRepo ? toShellRepo(activeRepo) : null,
      theme,
      onToggleTheme: toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      // Sidebar badge = PRs that still NEED review, not the total PR count.
      // 0 → undefined so the badge hides entirely when nothing needs review.
      prCount: pulls?.filter((p) => p.status === "needs_review").length || undefined,
    }),
    [
      pathname,
      repoId,
      repos,
      activeRepo,
      theme,
      toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      pulls,
    ],
  );

  return { ctx, repoPendingRemoval, confirmRemoveRepo, cancelRemoveRepo, removing: deleteRepo.isPending };
}
