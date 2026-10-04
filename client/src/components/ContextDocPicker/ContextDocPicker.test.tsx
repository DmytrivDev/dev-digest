import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachment, ContextDoc, InheritedContextAttachment } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";

const docContent = vi.hoisted(() => ({ current: "# Public API\n\nEndpoints." }));
vi.mock("@/lib/hooks/core", () => ({
  useContextDoc: (_repoId: string | null, path: string | null) => ({
    data: path ? { path, content: docContent.current, used_by_agents: 0 } : undefined,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

import { ContextDocPicker } from "./ContextDocPicker";

const onSave = vi.fn();
afterEach(() => {
  cleanup();
  onSave.mockReset();
});

const doc = (path: string, category: ContextDoc["category"] = "docs"): ContextDoc => ({
  path,
  name: path.slice(path.lastIndexOf("/") + 1),
  folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
  category,
  approx_tokens: 10,
});
const att = (path: string, present = true): ContextAttachment => ({
  path,
  present,
  approx_tokens: present ? 10 : null,
});

function renderPicker(props: Partial<React.ComponentProps<typeof ContextDocPicker>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextDocPicker
        repoId="r1"
        docs={[doc("a.md"), doc("b.md"), doc("c.md")]}
        attached={[]}
        onSave={onSave}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

/** Visible row names in render order, read off the checkbox labels. */
const names = () =>
  screen.getAllByRole("checkbox").map((el) => el.closest("label")?.textContent);
const rowOf = (name: string) =>
  screen.getByRole("checkbox", { name }).closest("[draggable]") as HTMLElement;
const dragOnto = (from: HTMLElement, to: HTMLElement) => {
  fireEvent.dragStart(from);
  fireEvent.dragOver(to);
  fireEvent.drop(to);
};

describe("ContextDocPicker", () => {
  it("leaves the focus ring visible on every control it renders (NFR-3)", () => {
    renderPicker({ attached: [att("a.md")] });
    const controls = [
      screen.getByRole("textbox", { name: "Filter documents by path" }),
      screen.getByRole("button", { name: /^Drag to reorder/ }),
      ...screen.getAllByRole("checkbox"),
      ...screen.getAllByRole("button", { name: /^Preview:/ }),
    ];
    for (const el of controls) {
      // jsdom cannot paint a focus ring, so assert the cause of a missing one:
      // an inline outline suppression overriding the global :focus-visible rule.
      expect(el.style.outlineStyle).not.toBe("none");
      expect(el.style.outline).not.toMatch(/none|^0/);
    }
  });

  it("lists attached documents first in attachment order, then the rest (AC-25)", () => {
    renderPicker({ attached: [att("b.md"), att("a.md")] });
    expect(names()).toEqual(["b.md", "a.md", "c.md"]);
  });

  it("shows the select-a-repository message and no rows without an active repo (AC-26)", () => {
    renderPicker({ repoId: null });
    expect(screen.getByText("Select a repository to attach its documents")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("shows file name, folder and category on a row (AC-27)", () => {
    renderPicker({ docs: [doc("specs/public-api.md", "specs")] });
    const row = rowOf("public-api.md");
    expect(within(row).getByText("public-api.md")).toBeInTheDocument();
    expect(within(row).getByText("specs/")).toBeInTheDocument();
    expect(within(row).getByText("specs")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Preview: specs/public-api.md" })).toBeInTheDocument();
  });

  it("appends a ticked document to the end and saves the complete list (AC-28, AC-31)", () => {
    renderPicker({ attached: [att("a.md"), att("b.md")] });
    fireEvent.click(screen.getByRole("checkbox", { name: "c.md" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(["a.md", "b.md", "c.md"]);
  });

  it("removes an unticked document, also on a missing row (AC-29)", () => {
    renderPicker({ attached: [att("a.md"), att("b.md")] });
    fireEvent.click(screen.getByRole("checkbox", { name: "a.md" }));
    expect(onSave).toHaveBeenLastCalledWith(["b.md"]);
    cleanup();
    onSave.mockReset();

    renderPicker({ docs: [doc("b.md")], attached: [att("gone.md", false), att("b.md")] });
    fireEvent.click(screen.getByRole("checkbox", { name: "gone.md" }));
    expect(onSave).toHaveBeenCalledWith(["b.md"]);
  });

  it("reorders by dragging one row onto another, saving once (AC-30, AC-31)", () => {
    renderPicker({ attached: [att("a.md"), att("b.md")] });
    dragOnto(rowOf("b.md"), rowOf("a.md"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(["b.md", "a.md"]);
  });

  it("reorders with the arrow keys on a focused handle (AC-30)", () => {
    renderPicker({ attached: [att("a.md"), att("b.md")] });
    fireEvent.keyDown(screen.getByRole("button", { name: /Drag to reorder b\.md/ }), { key: "ArrowUp" });
    expect(onSave).toHaveBeenCalledWith(["b.md", "a.md"]);
  });

  it("does not save when an arrow key cannot move the row", () => {
    renderPicker({ attached: [att("a.md"), att("b.md")] });
    fireEvent.keyDown(screen.getByRole("button", { name: /Drag to reorder a\.md/ }), { key: "ArrowUp" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the error and the last saved order when a save failed (AC-33)", () => {
    renderPicker({ attached: [att("b.md"), att("a.md")], saveError: "Couldn’t save the attached documents" });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save the attached documents");
    expect(names()).toEqual(["b.md", "a.md", "c.md"]);
  });

  it("filters rows by path, case-insensitively, keeping matching attached rows (AC-34)", () => {
    renderPicker({
      docs: [doc("specs/public-api.md", "specs"), doc("docs/deploy.md")],
      attached: [att("docs/deploy.md")],
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents by path" }), {
      target: { value: "API" },
    });
    expect(names()).toEqual(["public-api.md"]);

    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents by path" }), {
      target: { value: "DEPLOY" },
    });
    expect(names()).toEqual(["deploy.md"]);

    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents by path" }), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No documents match “zzz”.")).toBeInTheDocument();
  });

  it("marks an attached document the clone no longer holds as missing (AC-35)", () => {
    renderPicker({ docs: [doc("a.md")], attached: [att("gone.md", false)] });
    const row = rowOf("gone.md");
    expect(within(row).getByText("missing")).toBeInTheDocument();
  });

  it("shows inherited rows read-only with the skill name (AC-40)", () => {
    const inherited: InheritedContextAttachment[] = [
      { ...att("c.md"), skill_id: "s1", skill_name: "Security Rules" },
    ];
    renderPicker({ attached: [att("a.md")], inherited });
    expect(screen.getByText("via Security Rules")).toBeInTheDocument();
    // Only the two non-inherited rows are tickable, and only the attached one has a handle.
    expect(names()).toEqual(["a.md", "b.md"]);
    expect(screen.getAllByRole("button", { name: /Drag to reorder/ })).toHaveLength(1);
  });

  it("opens a dialog rendering the document's markdown on Preview (AC-36)", () => {
    renderPicker({ docs: [doc("specs/public-api.md", "specs")] });
    fireEvent.click(screen.getByRole("button", { name: "Preview: specs/public-api.md" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Public API" })).toBeInTheDocument();
    expect(dialog.getByText("Endpoints.")).toBeInTheDocument();
    // The close control keeps the global focus ring too (NFR-3).
    for (const el of dialog.getAllByRole("button")) expect(el.style.outlineStyle).not.toBe("none");
  });

  it("renders every control as a native button, input or checkbox button (NFR-3)", () => {
    renderPicker({ attached: [att("a.md")] });
    for (const el of screen.getAllByRole("checkbox")) expect(el.tagName).toBe("BUTTON");
    for (const el of screen.getAllByRole("button")) expect(el).not.toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: /Drag to reorder a\.md/ }).tagName).toBe("BUTTON");
  });

  it("says so when there is nothing to attach", () => {
    renderPicker({ docs: [] });
    expect(screen.getByText("No documents to attach.")).toBeInTheDocument();
  });
});
