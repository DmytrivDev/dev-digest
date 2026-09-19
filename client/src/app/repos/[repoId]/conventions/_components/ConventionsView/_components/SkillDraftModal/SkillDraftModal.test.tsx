import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/conventions.json";

const createSkill = vi.fn();
const state = vi.hoisted(() => ({
  draft: {
    name: "repo-conventions",
    description: "House conventions for acme/api",
    body: "# repo-conventions\n\n## naming\n\n- Name every service file service.ts. (src/a.ts:3)",
  } as { name: string; description: string; body: string } | undefined,
  isLoading: false,
  isError: false,
  skills: [] as { id: string; name: string; version: number }[],
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: state.skills }),
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillDraft: () => ({
    data: state.draft,
    isLoading: state.isLoading,
    isError: state.isError,
  }),
  useCreateConventionSkill: () => ({ mutateAsync: createSkill, isPending: false }),
}));

import { SkillDraftModal } from "./SkillDraftModal";

function renderModal(onClose = vi.fn(), onCreated = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <SkillDraftModal
        repoId="r1"
        repoName="acme/api"
        acceptedCount={3}
        onClose={onClose}
        onCreated={onCreated}
      />
    </NextIntlClientProvider>,
  );
  return { onClose, onCreated };
}

/** The body is a multi-line textarea, which `getByDisplayValue` can never find. */
function bodyField(): HTMLTextAreaElement {
  return screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.draft = {
    name: "repo-conventions",
    description: "House conventions for acme/api",
    body: "# repo-conventions\n\n## naming\n\n- Name every service file service.ts. (src/a.ts:3)",
  };
  state.isLoading = false;
  state.isError = false;
  state.skills = [];
});

describe("SkillDraftModal", () => {
  // Criterion 41: the body the server assembled is on screen and editable.
  it("shows the server's draft in editable fields", () => {
    renderModal();
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(screen.getByDisplayValue("House conventions for acme/api")).toBeInTheDocument();
    expect(bodyField()).toHaveValue(state.draft!.body);
  });

  it("says what the skill was merged from", () => {
    renderModal();
    expect(screen.getByText(/Merged from 3 accepted conventions in acme\/api/)).toBeInTheDocument();
  });

  it("waits for the draft before enabling the save", () => {
    state.draft = undefined;
    state.isLoading = true;
    renderModal();
    expect(screen.getByText("Assembling the draft…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("reports a draft that could not be assembled", () => {
    state.draft = undefined;
    state.isError = true;
    renderModal();
    expect(screen.getByText("Could not assemble the draft.")).toBeInTheDocument();
  });

  it("closes on Cancel without writing anything", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(createSkill).not.toHaveBeenCalled();
  });

  // An untouched field is OMITTED, which the route reads as "use what you
  // assembled" — that is what keeps an unchanged save byte-identical.
  it("posts nothing but the fields the user changed", async () => {
    createSkill.mockResolvedValue({ id: "s1", name: "repo-conventions" });
    const { onCreated } = renderModal();

    fireEvent.change(bodyField(), { target: { value: "# edited body" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(createSkill).toHaveBeenCalledWith({ body: "# edited body" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("saves the untouched draft as an empty patch", async () => {
    createSkill.mockResolvedValue({ id: "s1", name: "repo-conventions" });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() => expect(createSkill).toHaveBeenCalledWith({}));
  });

  // Saving matches an existing skill BY NAME, so the default name is usually
  // an update, not a create — and it changes the body of a skill agents may
  // already carry. The modal has to say so before the button is pressed.
  it("warns that the name is taken, and says what saving will do", () => {
    state.skills = [{ id: "s1", name: "repo-conventions", version: 3 }];
    renderModal();
    expect(screen.getByRole("note")).toHaveTextContent(
      /A skill named repo-conventions already exists \(v3\)/,
    );
    expect(screen.getByRole("note")).toHaveTextContent(/REPLACES its body/);
  });

  it("drops the warning once the name is free again", () => {
    state.skills = [{ id: "s1", name: "repo-conventions", version: 3 }];
    renderModal();
    fireEvent.change(screen.getByDisplayValue("repo-conventions"), {
      target: { value: "dev-digest-conventions" },
    });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("says nothing when no skill carries that name", () => {
    renderModal();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("refuses an empty name", () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue("repo-conventions"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });
});
