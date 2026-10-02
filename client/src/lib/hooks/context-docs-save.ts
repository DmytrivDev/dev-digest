/* hooks/context-docs-save.ts — optimistic save for the agent and skill Context tabs.

   Every tick, untick and reorder posts the COMPLETE ordered list, and the picker
   builds that list from the cached saved set. Without an optimistic write, two
   quick ticks both start from the same old list and the second POST overwrites
   the first (A is silently lost); responses landing out of order could also
   leave a stale set in the cache. So the cache is written BEFORE the request
   goes out, and the next change is computed from the in-flight list.

   The server's answer is written back only when no other save for the same
   target is still pending — otherwise an earlier response would clobber the
   newer optimistic list. A failed save rolls the cache back to the snapshot (the
   last saved set stays on screen, AC-33) and refetches, because the snapshot of
   an overlapping save may itself have been optimistic. */
"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { ContextAttachment, ContextDocList } from "@devdigest/shared";

interface Variables {
  repoId: string;
  paths: string[];
}

export interface Snapshot<D> {
  key: readonly unknown[];
  previous: D | undefined;
}

export function optimisticContextDocsSave<D extends { attached: ContextAttachment[] }, V extends Variables>(
  qc: QueryClient,
  {
    mutationKey,
    queryKey,
  }: {
    /** Identifies this mutation among all pending ones (see `pendingFor`). */
    mutationKey: string;
    /** The cache entry the variables write to. */
    queryKey: (vars: V) => readonly unknown[];
  },
) {
  const sameTarget = (a: readonly unknown[], b: readonly unknown[]) => JSON.stringify(a) === JSON.stringify(b);

  /** Saves for the same target still pending, including the one being settled. */
  const pendingFor = (vars: V) => {
    const key = queryKey(vars);
    return qc.isMutating({
      predicate: (m) =>
        m.options.mutationKey?.[0] === mutationKey &&
        sameTarget(queryKey(m.state.variables as V), key),
    });
  };

  return {
    mutationKey: [mutationKey],
    onMutate: async (vars: V): Promise<Snapshot<D>> => {
      const key = queryKey(vars);
      // A refetch already in flight would land after this write and undo it.
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<D>(key);
      if (previous) {
        const known = new Map(previous.attached.map((a) => [a.path, a]));
        const tokens = new Map(
          (qc.getQueryData<ContextDocList>(["context", vars.repoId])?.docs ?? []).map((d) => [
            d.path,
            d.approx_tokens,
          ]),
        );
        const attached = vars.paths.map(
          (path): ContextAttachment =>
            known.get(path) ?? { path, present: true, approx_tokens: tokens.get(path) ?? null },
        );
        qc.setQueryData<D>(key, { ...previous, attached });
      }
      return { key, previous };
    },
    /** Caches the server's answer unless a newer save for the same target is still pending. */
    onAnswer: (data: D, vars: V) => {
      if (pendingFor(vars) <= 1) qc.setQueryData<D>(queryKey(vars), data);
    },
    onError: (_err: unknown, vars: V, snapshot: Snapshot<D> | undefined) => {
      if (pendingFor(vars) > 1) return;
      if (snapshot?.previous) qc.setQueryData(snapshot.key, snapshot.previous);
      qc.invalidateQueries({ queryKey: queryKey(vars) });
    },
  };
}
