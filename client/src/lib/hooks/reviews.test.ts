import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";

/**
 * Pins the decision the whole smart-diff invalidation story rests on:
 * `["reviews", prId, "smart-diff"]` sits under the `["reviews", prId]` prefix,
 * so invalidating the reviews query also invalidates smart-diff — no new
 * call site is needed in `useRunReview`/`useFindingAction`/`useDeleteRun`/
 * `useDeleteReview`. If TanStack ever stops prefix-matching by default, this
 * test goes red first.
 */
describe("smart-diff query key sits under the reviews prefix", () => {
  it("invalidating [\"reviews\", prId] also invalidates [\"reviews\", prId, \"smart-diff\"]", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["reviews", "p1"], []);
    qc.setQueryData(["reviews", "p1", "smart-diff"], {
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    });

    await qc.invalidateQueries({ queryKey: ["reviews", "p1"] });

    expect(qc.getQueryState(["reviews", "p1", "smart-diff"])?.isInvalidated).toBe(true);
  });
});
