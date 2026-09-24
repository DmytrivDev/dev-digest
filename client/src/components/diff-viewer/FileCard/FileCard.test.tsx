import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { DiffAnnotation, DiffAnnotationApi } from "../annotations";
import shellMessages from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const FILE: PrFile = {
  path: "src/config.ts",
  additions: 2,
  deletions: 0,
  patch: "@@ -9,3 +9,4 @@\n   port: 3000,\n+  stripeKey: x,\n   redisUrl: y,",
};

function annotation(overrides: Partial<DiffAnnotation> = {}): DiffAnnotation {
  return {
    id: "a1",
    path: "src/config.ts",
    line: 10,
    color: "var(--crit)",
    icon: "AlertOctagon",
    label: "Blocker",
    content: <div>Hardcoded key finding</div>,
    ...overrides,
  };
}

function renderFileCard(props: Partial<Parameters<typeof FileCard>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <div data-theme="dark">
        <FileCard file={FILE} {...props} />
      </div>
    </NextIntlClientProvider>,
  );
}

describe("FileCard — marks and annotations", () => {
  it("renders the mark dot when the file is in `marks.paths`", () => {
    renderFileCard({ marks: { paths: new Set(["src/config.ts"]), label: "Has findings" } });
    expect(screen.getByLabelText("Has findings")).toBeInTheDocument();
  });

  it("does not render the mark dot when the file is not in `marks.paths`", () => {
    renderFileCard({ marks: { paths: new Set(["other.ts"]), label: "Has findings" } });
    expect(screen.queryByLabelText("Has findings")).not.toBeInTheDocument();
  });

  it("renders the annotation's content under the line whose newNo equals `line`", () => {
    const api: DiffAnnotationApi = { items: [annotation({ line: 10 })], visible: true };
    renderFileCard({ annotations: api });
    expect(screen.getByText("Hardcoded key finding")).toBeInTheDocument();
    expect(screen.getByText("Blocker")).toBeInTheDocument();
  });

  it("shows an annotation on a line not in the patch under the unanchored title", () => {
    const api: DiffAnnotationApi = { items: [annotation({ line: 999 })], visible: true };
    renderFileCard({ annotations: api });
    expect(screen.getByText("Not on a line in this diff (1)")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded key finding")).toBeInTheDocument();
  });

  it("renders nothing when annotations.visible is false", () => {
    const api: DiffAnnotationApi = { items: [annotation({ line: 10 })], visible: false };
    renderFileCard({ annotations: api });
    expect(screen.queryByText("Hardcoded key finding")).not.toBeInTheDocument();
  });
});
