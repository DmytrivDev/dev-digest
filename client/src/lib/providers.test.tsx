import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Providers } from "./providers";
import { ApiError } from "./api";

/**
 * The global error surfacing in `Providers`: mutations always toast, queries toast
 * only on network (status 0) / 5xx, and `meta: { quietError: true }` silences both
 * (the PR Brief shows its own inline error instead — AC-14). The real ToastProvider
 * renders the toast, so "raises the toast" means the message is in the DOM.
 */

afterEach(cleanup);

function FailingQuery({ status, quiet }: { status: number; quiet?: boolean }) {
  const q = useQuery({
    queryKey: ["failing", status, !!quiet],
    queryFn: () => Promise.reject(new ApiError(`query failed ${status}`, status)),
    retry: false,
    meta: quiet ? { quietError: true } : undefined,
  });
  return <span>{q.isError ? "query settled" : "query pending"}</span>;
}

function FailingMutation({ quiet }: { quiet?: boolean }) {
  const m = useMutation({
    mutationFn: () => Promise.reject(new ApiError("mutation failed", 422)),
    meta: quiet ? { quietError: true } : undefined,
  });
  return (
    <button type="button" onClick={() => m.mutate()}>
      {m.isError ? "mutation settled" : "run mutation"}
    </button>
  );
}

const renderInProviders = (ui: React.ReactElement) => render(<Providers>{ui}</Providers>);

describe("Providers — global error toast", () => {
  it.each([0, 502])("toasts a failing query with status %i", async (status) => {
    renderInProviders(<FailingQuery status={status} />);
    expect(await screen.findByText(`query failed ${status}`)).toBeInTheDocument();
  });

  it("stays silent for an expected 4xx query failure", async () => {
    renderInProviders(<FailingQuery status={404} />);
    await screen.findByText("query settled");
    expect(screen.queryByText("query failed 404")).not.toBeInTheDocument();
  });

  it.each([0, 502])(
    "does not toast a failing query with status %i when meta.quietError is set",
    async (status) => {
      renderInProviders(<FailingQuery status={status} quiet />);
      await screen.findByText("query settled");
      expect(screen.queryByText(`query failed ${status}`)).not.toBeInTheDocument();
    },
  );

  it("toasts a failing mutation without meta.quietError", async () => {
    renderInProviders(<FailingMutation />);
    fireEvent.click(screen.getByRole("button", { name: "run mutation" }));
    expect(await screen.findByText("mutation failed")).toBeInTheDocument();
  });

  it("does not toast a failing mutation with meta.quietError", async () => {
    renderInProviders(<FailingMutation quiet />);
    fireEvent.click(screen.getByRole("button", { name: "run mutation" }));
    // By name: toasts raised meanwhile (e.g. an earlier test's failing query refetching) carry
    // their own "Dismiss" buttons, so an unnamed role query finds several (seen on CI).
    expect(await screen.findByRole("button", { name: "mutation settled" })).toBeInTheDocument();
    expect(screen.queryByText("mutation failed")).not.toBeInTheDocument();
  });
});
