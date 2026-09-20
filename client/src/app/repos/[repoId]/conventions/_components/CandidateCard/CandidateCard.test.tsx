import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import common from "../../../../../../../messages/en/common.json";
import { CandidateCard } from "./CandidateCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "validation",
  rule: "Declare the request body as a Zod schema and pass it in the route schema.",
  evidence_path: "src/modules/skills/routes.ts",
  evidence_line: 96,
  evidence_snippet: "app.post('/skills', { schema: { body: CreateSkillBody } }, handler)",
  evidence_url: "https://github.com/acme/api/blob/9c4f1ab/src/modules/skills/routes.ts#L96",
  confidence: 0.92,
  status: "pending",
  created_at: "2026-09-19T12:04:11.338Z",
};

function renderCard(
  candidate: Partial<ConventionCandidate> = {},
  handlers: { onTriage?: () => void; onSaveEdit?: () => void; onDelete?: () => void } = {},
) {
  const onTriage = handlers.onTriage ?? vi.fn();
  const onSaveEdit = handlers.onSaveEdit ?? vi.fn();
  const onDelete = handlers.onDelete ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages, common }}>
      <CandidateCard
        candidate={{ ...CANDIDATE, ...candidate }}
        onTriage={onTriage}
        onSaveEdit={onSaveEdit}
        onDelete={onDelete}
      />
    </NextIntlClientProvider>,
  );
  return { onTriage, onSaveEdit, onDelete };
}

describe("CandidateCard", () => {
  it("shows the rule, its category and the confidence", () => {
    renderCard();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("validation")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("links the evidence to the permalink the scan pinned", () => {
    renderCard();
    const link = screen.getByRole("link", { name: "src/modules/skills/routes.ts:96" });
    expect(link).toHaveAttribute("href", CANDIDATE.evidence_url);
    expect(link).toHaveAttribute("target", "_blank");
  });

  // The server leaves `evidence_url` null when it could not resolve a head sha
  // at scan time. A link with no destination would look like a broken feature.
  it("prints the citation as text when there is no permalink", () => {
    renderCard({ evidence_url: null });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("src/modules/skills/routes.ts:96")).toBeInTheDocument();
  });

  it("accepts and rejects through one triage handler", () => {
    const { onTriage } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onTriage).toHaveBeenCalledWith("accepted");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onTriage).toHaveBeenCalledWith("rejected");
  });

  it("locks the action that already holds, and keeps the other reachable", () => {
    renderCard({ status: "rejected" });
    expect(screen.getByRole("button", { name: "Rejected" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  });

  // Criterion 49: editing happens IN the card. The evidence block stays on
  // screen, which is how you can tell nothing navigated away.
  it("edits inline and saves the new wording and category", () => {
    const { onSaveEdit } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const textarea = screen
      .getAllByRole("textbox")
      .find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
    expect(textarea).toHaveValue(CANDIDATE.rule);
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "Validate every body with Zod." } });
    // The category picker is the app's own dropdown (a native select's popup
    // cannot be styled), so it opens on a click and the rows are buttons.
    fireEvent.click(screen.getByRole("button", { name: "validation" }));
    fireEvent.click(screen.getByRole("button", { name: "typing" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSaveEdit).toHaveBeenCalledWith({
      rule: "Validate every body with Zod.",
      category: "typing",
    });
  });

  it("cancels an edit without writing anything", () => {
    const { onSaveEdit } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSaveEdit).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("refuses to save an empty rule", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const textarea = screen
      .getAllByRole("textbox")
      .find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

// Deleting is not rejecting, and the card must ask before it happens: a
// rejected candidate is remembered and suppressed at the next scan, a deleted
// one is gone and the same rule can be proposed again as new.
describe("CandidateCard (delete)", () => {
  it("asks first and deletes only on confirm", () => {
    const { onDelete } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this candidate?")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete candidate"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("cancels without deleting", () => {
    const { onDelete } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete this candidate?")).not.toBeInTheDocument();
  });
});
