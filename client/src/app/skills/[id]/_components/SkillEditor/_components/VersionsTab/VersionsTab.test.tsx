import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import common from "../../../../../../../../messages/en/common.json";

const restore = vi.fn();
const versions = vi.hoisted(() => ({ current: [] as SkillVersion[] }));

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: versions.current, isLoading: false, isError: false }),
  useRestoreSkillVersion: () => ({ mutate: restore, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

const SKILL: Skill = {
  id: "sk1",
  name: "test-quality-rubric",
  description: "Use when the diff adds or changes tests.",
  type: "rubric",
  source: "manual",
  body: "# Rubric\n\nFlag uncovered branches.",
  enabled: true,
  version: 3,
  evidence_files: null,
};

const version = (v: number, body: string): SkillVersion => ({
  skill_id: "sk1",
  version: v,
  body,
  created_at: "2026-09-18T10:00:00.000Z",
});

function renderTab(skill: Skill = SKILL) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
      <VersionsTab skill={skill} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  restore.mockReset();
  versions.current = [];
  vi.unstubAllGlobals();
});

describe("VersionsTab", () => {
  it("lists every snapshot newest first with its version chip", () => {
    versions.current = [version(3, SKILL.body), version(2, "second"), version(1, "first")];
    renderTab();
    expect(screen.getByText("Version history")).toBeInTheDocument();
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  // "Current" tracks the SKILL row's version, not the newest snapshot — a
  // metadata-only edit writes no snapshot, so the two are only comparable by
  // number.
  it("marks the skill's own version as current and offers it no actions", () => {
    versions.current = [version(3, SKILL.body), version(2, "second")];
    renderTab();
    expect(screen.getByText("Current")).toBeInTheDocument();
    // Exactly one older row, so exactly one Diff/Restore pair.
    expect(screen.getAllByText("Diff")).toHaveLength(1);
    expect(screen.getAllByText("Restore")).toHaveLength(1);
  });

  // The row's Restore only OPENS the dialog; the mutation is the dialog's own
  // button. Asserting both halves is the point — a restore that fired on the
  // first click would make the confirmation decorative.
  it("restores an older version through the confirm dialog, sending its number", () => {
    versions.current = [version(3, SKILL.body), version(1, "first")];
    renderTab();
    fireEvent.click(screen.getByText("Restore"));
    expect(restore).not.toHaveBeenCalled();
    expect(screen.getByText("Restore v1?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Restore this version"));
    expect(restore).toHaveBeenCalledWith(
      { id: "sk1", version: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("does not restore when the dialog is cancelled", () => {
    versions.current = [version(3, SKILL.body), version(1, "first")];
    renderTab();
    fireEvent.click(screen.getByText("Restore"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(restore).not.toHaveBeenCalled();
    expect(screen.queryByText("Restore v1?")).not.toBeInTheDocument();
  });

  it("diffs a snapshot against the body in the editor", () => {
    versions.current = [version(3, SKILL.body), version(1, "# Rubric\n\nOld wording.")];
    renderTab();
    fireEvent.click(screen.getByText("Diff"));
    expect(screen.getByText("v1 compared with the current body")).toBeInTheDocument();
    expect(screen.getByText(/Old wording\./)).toBeInTheDocument();
    expect(screen.getByText(/Flag uncovered branches\./)).toBeInTheDocument();
  });

  it("says so when a snapshot is identical to the current body", () => {
    versions.current = [version(3, "newer"), version(1, SKILL.body)];
    renderTab();
    fireEvent.click(screen.getByText("Diff"));
    expect(screen.getByText("This snapshot is identical to the current body.")).toBeInTheDocument();
  });

  it("shows the empty state when there are no snapshots", () => {
    renderTab();
    expect(screen.getByText("No snapshots yet.")).toBeInTheDocument();
  });
});
