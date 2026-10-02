/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { optimisticContextDocsSave } from "./context-docs-save";
import type {
  Agent,
  AgentContextDocs,
  AgentSkillLink,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from "@devdigest/shared";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

/**
 * Persist the order the agent cards were dragged into.
 *
 * Sends the COMPLETE ordered id list, matching the server: a partial move would
 * leave rows sharing a position. The cache is re-ordered immediately so the
 * grid does not snap back mid-flight, and invalidated after so the server's
 * answer is the one that survives.
 */
export function useReorderAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post<{ ok: boolean }>("/agents/reorder", { ids }),
    onMutate: (ids) => {
      qc.setQueryData<Agent[]>(["agents"], (prev) => {
        if (!prev) return prev;
        const byId = new Map(prev.map((row) => [row.id, row]));
        return ids.map((id) => byId.get(id)).filter((row): row is Agent => row !== undefined);
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", data.id], data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.removeQueries({ queryKey: ["agent", id] });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

/**
 * The skills linked to an agent, in prompt order.
 *
 * Lives here rather than in hooks/skills.ts because the endpoint is
 * agent-scoped: `agent_skills` is owned by the agents module, and the Skills
 * page never reads it.
 */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Replace an agent's linked skills with this exact ordered list.
 *
 * The server replaces the whole set in one transaction, so attach, detach and
 * reorder are all this one call — there is no partial state where an agent has
 * lost its skills because a second request failed.
 */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-skills", agentId], data);
      // The linked skills decide which documents the agent inherits, the "via
      // <skill>" badges and the token estimate on its Context tab, and "Used by
      // N agents" on the Project Context page.
      qc.invalidateQueries({ queryKey: ["agent-context-docs", agentId] });
      qc.invalidateQueries({ queryKey: ["context-doc"] });
    },
  });
}

/**
 * The project-context documents attached to an agent for one repository, in
 * attachment order, plus those it inherits through enabled linked skills.
 *
 * Keyed by repo as well as agent: an attachment is (repo, path), and the tab
 * shows whichever repository is active.
 */
export function useAgentContextDocs(
  agentId: string | null | undefined,
  repoId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["agent-context-docs", agentId, repoId],
    queryFn: () =>
      api.get<AgentContextDocs>(
        `/agents/${agentId}/context-docs?repo_id=${encodeURIComponent(repoId as string)}`,
      ),
    enabled: !!agentId && !!repoId,
  });
}

/**
 * Replace an agent's attached documents for one repository with this exact
 * ordered list. Attach, detach and reorder are all this one call, like
 * `useSetAgentSkills`.
 *
 * `quietError`: the tab renders its own save error next to the list, so the
 * global mutation toast would only say the same thing twice.
 */
export function useSetAgentContextDocs() {
  const qc = useQueryClient();
  // Optimistic: two quick ticks must both survive (see context-docs-save.ts).
  const optimistic = optimisticContextDocsSave<
    AgentContextDocs,
    { agentId: string; repoId: string; paths: string[] }
  >(qc, {
    mutationKey: "set-agent-context-docs",
    queryKey: ({ agentId, repoId }) => ["agent-context-docs", agentId, repoId],
  });
  return useMutation({
    meta: { quietError: true },
    mutationKey: optimistic.mutationKey,
    onMutate: optimistic.onMutate,
    onError: optimistic.onError,
    mutationFn: ({ agentId, repoId, paths }: { agentId: string; repoId: string; paths: string[] }) =>
      api.post<AgentContextDocs>(`/agents/${agentId}/context-docs`, { repo_id: repoId, paths }),
    onSuccess: (data, vars) => {
      optimistic.onAnswer(data, vars);
      // "Used by N agents" on the Project Context page just changed.
      qc.invalidateQueries({ queryKey: ["context-doc"] });
    },
  });
}
