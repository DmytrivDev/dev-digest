import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
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

describe("FileCard — deep-link focus", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  // Large enough to collapse by default (> AUTO_EXPAND_MAX_LINES), same patch.
  const BIG: PrFile = { ...FILE, additions: 250, deletions: 0 };

  /** The element a scrollIntoView call was made on. */
  const scrolledElement = () => scrollIntoView.mock.contexts[0] as HTMLElement;

  it("without `focus` a large file stays collapsed and nothing scrolls", () => {
    renderFileCard({ file: BIG });
    expect(screen.queryByText("stripeKey: x,")).not.toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("a focused file with > 200 changed lines renders its lines", () => {
    renderFileCard({ file: BIG, focus: { path: "src/config.ts", line: null } });
    expect(screen.getByText("stripeKey: x,")).toBeInTheDocument();
  });

  it("a different focused path leaves a large file collapsed", () => {
    renderFileCard({ file: BIG, focus: { path: "src/other.ts", line: 10 } });
    expect(screen.queryByText("stripeKey: x,")).not.toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("only the focused card gets the accent border", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <div data-theme="dark">
          <FileCard file={FILE} focus={{ path: "src/config.ts", line: null }} />
          <FileCard file={{ ...FILE, path: "src/other.ts" }} focus={{ path: "src/config.ts", line: null }} />
        </div>
      </NextIntlClientProvider>,
    );
    const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-theme] > div"));
    expect(cards).toHaveLength(2);
    expect(cards[0]!.style.borderColor).toBe("var(--accent)");
    expect(cards[1]!.style.borderColor).toBe("var(--border)");
  });

  it("scrolls the row whose NEW-side number equals `line`, and highlights only that row", () => {
    const { container } = renderFileCard({ focus: { path: "src/config.ts", line: 10 } });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(scrolledElement().textContent).toContain("stripeKey: x,");
    const highlighted = container.querySelectorAll("[data-highlighted]");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toBe(scrolledElement());
  });

  it("a line that is not rendered scrolls the card header and highlights no row", () => {
    const { container } = renderFileCard({ focus: { path: "src/config.ts", line: 9999 } });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrolledElement().textContent).toContain("src/config.ts");
    expect(container.querySelectorAll("[data-highlighted]")).toHaveLength(0);
  });

  it("a focus with no line scrolls the card header", () => {
    renderFileCard({ focus: { path: "src/config.ts", line: null } });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrolledElement().textContent).toContain("src/config.ts");
  });

  it("matches the focus path after normalisation (./ prefix)", () => {
    renderFileCard({ focus: { path: "./src/config.ts", line: 10 } });
    expect(scrolledElement().textContent).toContain("stripeKey: x,");
  });
});
