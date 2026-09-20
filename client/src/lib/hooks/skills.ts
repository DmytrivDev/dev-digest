/* hooks/skills.ts — React Query hooks for the Skills page + Skill Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Skill, SkillSource, SkillStats, SkillType, SkillVersion } from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      // Saving a changed BODY snapshots a new version server-side, so the
      // history is stale the moment this resolves. Invalidating unconditionally
      // is right even though a metadata-only edit writes no snapshot: the
      // mutation cannot see which fields actually changed, and re-fetching a
      // short list nobody is looking at costs less than showing a version list
      // that is missing the version you just created.
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

/**
 * Usage statistics for one skill.
 *
 * Kept out of `useSkill` deliberately: the stats run three queries server-side
 * and are only wanted on one tab, while `useSkill` is loaded by the editor
 * shell on every tab.
 */
export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/** Body snapshots for one skill, newest version first. */
/**
 * Persist the order the cards were dragged into.
 *
 * Sends the COMPLETE ordered id list, matching the server: a partial move would
 * leave rows sharing a position. The cache is re-ordered immediately so the
 * grid does not snap back while the request is in flight, and invalidated after
 * so the server's answer is the one that survives.
 */
export function useReorderSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post<{ ok: boolean }>("/skills/reorder", { ids }),
    onMutate: (ids) => {
      qc.setQueryData<Skill[]>(["skills"], (prev) => {
        if (!prev) return prev;
        const byId = new Map(prev.map((row) => [row.id, row]));
        return ids.map((id) => byId.get(id)).filter((row): row is Skill => row !== undefined);
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/**
 * Re-apply an older body. The server writes it FORWARD as a new version, so
 * the skill row, its history and any list showing `v{n}` all move — invalidate
 * all three rather than patching the cache by hand.
 */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/restore`, { version }),
    onSuccess: (data) => {
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
      // A deleted skill disappears from every agent's link list, so any cached
      // one is now wrong.
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

/** What the server says an upload WOULD become. Nothing is persisted yet. */
export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  /** Archive entries the server listed but never opened. */
  ignored_entries: string[];
  /** Which archive entry the body came from; null for a bare .md. */
  source_entry: string | null;
}

/**
 * Parse an upload server-side without saving it.
 *
 * Deliberately a separate step from `useCreateSkill`: an imported skill is
 * somebody else's instructions heading for your agent's prompt, so you see the
 * body first and save second. No cache is invalidated — nothing changed.
 */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_base64: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}
