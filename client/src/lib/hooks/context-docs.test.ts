import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";

const { post, put, del } = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    del: (...args: unknown[]) => del(...args),
  },
}));

import { useSetAgentContextDocs, useSetAgentSkills } from "./agents";
import { useDeleteSkill, useSetSkillContextDocs, useUpdateSkill } from "./skills";

afterEach(() => {
  post.mockReset();
  put.mockReset();
  del.mockReset();
});

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

const att = (path: string) => ({ path, present: true, approx_tokens: 10 });
const pathsIn = (qc: QueryClient, key: unknown[]) =>
  (qc.getQueryData<{ attached: { path: string }[] }>(key)?.attached ?? []).map((a) => a.path);

/** A promise the test settles by hand, so a POST can stay in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSetAgentContextDocs — optimistic save", () => {
  const KEY = ["agent-context-docs", "ag1", "r1"];
  const seed = (qc: QueryClient) =>
    qc.setQueryData(KEY, { repo_id: "r1", attached: [], inherited: [] });

  it("keeps both documents when a second tick lands before the first save resolves", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const qc = new QueryClient();
    seed(qc);
    const { result } = renderHook(() => useSetAgentContextDocs(), { wrapper: wrapperFor(qc) });

    // Tick A. The picker would build the next list from the cache.
    await act(async () => {
      result.current.mutate({ agentId: "ag1", repoId: "r1", paths: ["a.md"] });
    });
    expect(pathsIn(qc, KEY)).toEqual(["a.md"]);

    // Tick B before A's POST returned: computed from the in-flight list.
    await act(async () => {
      result.current.mutate({
        agentId: "ag1",
        repoId: "r1",
        paths: [...pathsIn(qc, KEY), "b.md"],
      });
    });
    expect(post).toHaveBeenNthCalledWith(2, "/agents/ag1/context-docs", {
      repo_id: "r1",
      paths: ["a.md", "b.md"],
    });

    // Responses land out of order: B first, then A's older answer.
    await act(async () => {
      second.resolve({ repo_id: "r1", attached: [att("a.md"), att("b.md")], inherited: [] });
      first.resolve({ repo_id: "r1", attached: [att("a.md")], inherited: [] });
    });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(pathsIn(qc, KEY)).toEqual(["a.md", "b.md"]);
  });

  it("restores the previous set when the save fails", async () => {
    post.mockRejectedValueOnce(new Error("boom"));
    const qc = new QueryClient();
    qc.setQueryData(KEY, { repo_id: "r1", attached: [att("a.md")], inherited: [] });
    const { result } = renderHook(() => useSetAgentContextDocs(), { wrapper: wrapperFor(qc) });

    await act(async () => {
      result.current.mutate({ agentId: "ag1", repoId: "r1", paths: ["a.md", "b.md"] });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(pathsIn(qc, KEY)).toEqual(["a.md"]);
  });

  it("estimates a newly ticked document from the cached list while the save is in flight", async () => {
    post.mockReturnValueOnce(deferred<unknown>().promise);
    const qc = new QueryClient();
    seed(qc);
    qc.setQueryData(["context", "r1"], {
      docs: [{ path: "a.md", approx_tokens: 123 }],
    });
    const { result } = renderHook(() => useSetAgentContextDocs(), { wrapper: wrapperFor(qc) });

    await act(async () => {
      result.current.mutate({ agentId: "ag1", repoId: "r1", paths: ["a.md"] });
    });

    expect(qc.getQueryData<{ attached: unknown[] }>(KEY)?.attached).toEqual([
      { path: "a.md", present: true, approx_tokens: 123 },
    ]);
  });
});

describe("useSetSkillContextDocs — optimistic save", () => {
  const KEY = ["skill-context-docs", "sk1", "r1"];

  it("keeps both documents when a second tick lands before the first save resolves", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const qc = new QueryClient();
    qc.setQueryData(KEY, { repo_id: "r1", attached: [] });
    const { result } = renderHook(() => useSetSkillContextDocs(), { wrapper: wrapperFor(qc) });

    await act(async () => {
      result.current.mutate({ skillId: "sk1", repoId: "r1", paths: ["a.md"] });
    });
    await act(async () => {
      result.current.mutate({
        skillId: "sk1",
        repoId: "r1",
        paths: [...pathsIn(qc, KEY), "b.md"],
      });
    });
    expect(post).toHaveBeenNthCalledWith(2, "/skills/sk1/context-docs", {
      repo_id: "r1",
      paths: ["a.md", "b.md"],
    });

    await act(async () => {
      second.resolve({ repo_id: "r1", attached: [att("a.md"), att("b.md")] });
      first.resolve({ repo_id: "r1", attached: [att("a.md")] });
    });
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(pathsIn(qc, KEY)).toEqual(["a.md", "b.md"]);
  });

  it("restores the previous set when the save fails", async () => {
    post.mockRejectedValueOnce(new Error("boom"));
    const qc = new QueryClient();
    qc.setQueryData(KEY, { repo_id: "r1", attached: [att("a.md")] });
    const { result } = renderHook(() => useSetSkillContextDocs(), { wrapper: wrapperFor(qc) });

    await act(async () => {
      result.current.mutate({ skillId: "sk1", repoId: "r1", paths: [] });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(pathsIn(qc, KEY)).toEqual(["a.md"]);
  });
});

/**
 * An agent's inherited documents, their "via <skill>" badges and the token
 * estimate depend on its skill links and on each skill's enabled flag and name;
 * "Used by N agents" depends on the same. These mutations change them, so the
 * cached context queries must go stale the moment they resolve.
 */
describe("skill mutations invalidate the agent context caches", () => {
  function seeded() {
    const qc = new QueryClient();
    qc.setQueryData(["agent-context-docs", "ag1", "r1"], { repo_id: "r1", attached: [], inherited: [] });
    qc.setQueryData(["context-doc", "r1", "a.md"], { path: "a.md", content: "", used_by_agents: 1 });
    return qc;
  }
  const stale = (qc: QueryClient, key: unknown[]) => qc.getQueryState(key)?.isInvalidated;

  it("useUpdateSkill", async () => {
    put.mockResolvedValue({ id: "sk1" });
    const qc = seeded();
    const { result } = renderHook(() => useUpdateSkill(), { wrapper: wrapperFor(qc) });

    result.current.mutate({ id: "sk1", patch: { enabled: false } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(stale(qc, ["agent-context-docs", "ag1", "r1"])).toBe(true);
    expect(stale(qc, ["context-doc", "r1", "a.md"])).toBe(true);
  });

  it("useSetAgentSkills", async () => {
    post.mockResolvedValue([]);
    const qc = seeded();
    const { result } = renderHook(() => useSetAgentSkills(), { wrapper: wrapperFor(qc) });

    result.current.mutate({ agentId: "ag1", skillIds: ["sk1"] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(stale(qc, ["agent-context-docs", "ag1", "r1"])).toBe(true);
    expect(stale(qc, ["context-doc", "r1", "a.md"])).toBe(true);
  });

  it("useSetAgentSkills leaves another agent's context cache alone", async () => {
    post.mockResolvedValue([]);
    const qc = seeded();
    qc.setQueryData(["agent-context-docs", "ag2", "r1"], { repo_id: "r1", attached: [], inherited: [] });
    const { result } = renderHook(() => useSetAgentSkills(), { wrapper: wrapperFor(qc) });

    result.current.mutate({ agentId: "ag1", skillIds: ["sk1"] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(stale(qc, ["agent-context-docs", "ag2", "r1"])).toBe(false);
  });

  it("useDeleteSkill", async () => {
    del.mockResolvedValue({ ok: true });
    const qc = seeded();
    const { result } = renderHook(() => useDeleteSkill(), { wrapper: wrapperFor(qc) });

    result.current.mutate("sk1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(stale(qc, ["agent-context-docs", "ag1", "r1"])).toBe(true);
    expect(stale(qc, ["context-doc", "r1", "a.md"])).toBe(true);
  });
});
