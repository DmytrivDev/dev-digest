import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";
import type { SkillImportPreview } from "../../../../../../lib/hooks/skills";

const parseAsync = vi.fn();
const createAsync = vi.fn();

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync: parseAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createAsync, isPending: false }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

const PREVIEW: SkillImportPreview = {
  name: "Zipped Skill",
  description: "Use it on every PR.",
  type: "security",
  body: "# Zipped Skill\n\nFlag the thing.",
  ignored_entries: ["pack/bin/tool.exe", "pack/install.sh"],
  source_entry: "pack/SKILL.md",
};

function renderDrawer(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ImportSkillDrawer onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onClose;
}

/** Drive the hidden <input type="file"> the way the browser would. */
function pickFile(name: string, content = "# Zipped Skill\n") {
  const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([content], name)] } });
}

afterEach(() => {
  cleanup();
  parseAsync.mockReset();
  createAsync.mockReset();
});

describe("ImportSkillDrawer", () => {
  it("cannot save before a file has been parsed", () => {
    renderDrawer();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
  });

  it("shows the parsed preview WITHOUT saving anything", async () => {
    parseAsync.mockResolvedValue(PREVIEW);
    renderDrawer();
    pickFile("pack.zip");

    await waitFor(() => expect(screen.getByText("Preview before saving")).toBeInTheDocument());
    // The whole point of the two-step flow: a preview is a read.
    expect(createAsync).not.toHaveBeenCalled();
    // Name in the summary line, and again as the rendered markdown heading.
    expect(screen.getByRole("heading", { name: "Zipped Skill" })).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText(/Read from pack\/SKILL\.md/)).toBeInTheDocument();
  });

  it("names every archive entry it refused to open", async () => {
    parseAsync.mockResolvedValue(PREVIEW);
    renderDrawer();
    pickFile("pack.zip");

    await waitFor(() => expect(screen.getByText(/2 archive entries were not read/)).toBeInTheDocument());
    expect(screen.getByText("pack/install.sh")).toBeInTheDocument();
    expect(screen.getByText("pack/bin/tool.exe")).toBeInTheDocument();
    expect(screen.getByText(/never opened and never run/)).toBeInTheDocument();
  });

  it("saves the confirmed skill DISABLED and as an imported source", async () => {
    parseAsync.mockResolvedValue(PREVIEW);
    createAsync.mockResolvedValue({ ...PREVIEW, id: "sk9", enabled: false, version: 1 });
    const onClose = renderDrawer();
    pickFile("pack.zip");
    await waitFor(() => expect(screen.getByText("Preview before saving")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));

    await waitFor(() => expect(createAsync).toHaveBeenCalledTimes(1));
    expect(createAsync.mock.calls[0]![0]).toEqual({
      name: PREVIEW.name,
      description: PREVIEW.description,
      type: PREVIEW.type,
      body: PREVIEW.body,
      source: "imported_url",
      enabled: false,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("reports a rejected file inline and keeps Save unavailable", async () => {
    parseAsync.mockRejectedValue(new Error("Only .md, .markdown and .zip files can be imported."));
    renderDrawer();
    pickFile("skill.exe");

    await waitFor(() => expect(screen.getByText(/Import failed/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
    expect(screen.queryByText("Preview before saving")).not.toBeInTheDocument();
  });

  it("rejects an oversized file before it ever reaches the server", () => {
    renderDrawer();
    // 600 KB > the 512 KB client guard.
    const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x".repeat(600 * 1024)], "huge.md")] },
    });

    expect(screen.getByText(/too large/)).toBeInTheDocument();
    expect(parseAsync).not.toHaveBeenCalled();
  });
});
