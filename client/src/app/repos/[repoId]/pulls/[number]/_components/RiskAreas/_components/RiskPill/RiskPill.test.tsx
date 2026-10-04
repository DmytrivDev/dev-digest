import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Risk } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import type { BriefNav } from "../../../BriefFileRef";
import { RiskPill } from "./RiskPill";

afterEach(cleanup);

const risk = (o: Partial<Risk> = {}): Risk => ({
  kind: "deps",
  title: "New dependency: ioredis",
  explanation: "Adds a Redis client to the request path.",
  severity: "medium",
  file_refs: ["package.json:34", "src/middleware/ratelimit.ts:12-18"],
  ...o,
});

function renderPill(r: Risk, nav: Partial<BriefNav> = {}) {
  const full: BriefNav = {
    prPaths: new Set(["package.json", "src/a.ts"]),
    blobHref: () => null,
    onOpen: vi.fn(),
    ...nav,
  };
  const view = render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <RiskPill risk={r} nav={full} />
    </NextIntlClientProvider>,
  );
  return { ...view, nav: full };
}

/** The kind icon is the first svg in the pill (lucide stamps its name into the class). */
function kindIcon(container: HTMLElement): SVGElement {
  return container.querySelector("svg") as SVGElement;
}

describe("RiskPill", () => {
  it("renders the kind icon in the severity colour, the title, the first ref and a chevron (AC-24)", () => {
    const { container } = renderPill(risk());
    expect(screen.getByText("New dependency: ioredis")).toBeInTheDocument();
    // Only the first ref shows while collapsed.
    expect(screen.getByRole("button", { name: "package.json:34" })).toBeInTheDocument();
    expect(screen.queryByText("src/middleware/ratelimit.ts:12-18")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show details" })).toBeInTheDocument();

    expect(kindIcon(container).style.color).toBe("var(--warn)");
    expect(kindIcon(container).getAttribute("class")).toMatch(/lucide-boxes/);
  });

  it.each([
    ["security", /lucide-shield/, "high", "var(--crit)"],
    ["db_migration", /lucide-database/, "low", "var(--info)"],
    ["perf", /lucide-zap/, "low", "var(--info)"],
  ] as const)("uses the %s icon coloured for %s severity", (kind, cls, severity, colour) => {
    const { container } = renderPill(risk({ kind, severity }));
    expect(kindIcon(container).getAttribute("class")).toMatch(cls);
    expect(kindIcon(container).style.color).toBe(colour);
  });

  it("falls back to the AlertTriangle icon for an unknown kind (AC-25)", () => {
    const known = renderPill(risk({ kind: "security" }));
    const securityClass = kindIcon(known.container).getAttribute("class");
    cleanup();
    const { container } = renderPill(risk({ kind: "license" }));
    const cls = kindIcon(container).getAttribute("class");
    expect(cls).toMatch(/lucide-(triangle-alert|alert-triangle)/);
    expect(cls).not.toBe(securityClass);
  });

  // `kind` is a free model string: inherited Object.prototype members must not resolve
  // to a "icon" (that made <KindIcon/> throw "Element type is invalid").
  it.each(["constructor", "__proto__", "toString"])(
    "renders the AlertTriangle fallback for the prototype-key kind %s without throwing",
    (kind) => {
      const { container } = renderPill(risk({ kind }));
      expect(kindIcon(container).getAttribute("class")).toMatch(/lucide-(triangle-alert|alert-triangle)/);
      expect(screen.getByText("New dependency: ioredis")).toBeInTheDocument();
    },
  );

  it("falls back to the low colour for a prototype-key severity", () => {
    const { container } = renderPill(risk({ severity: "constructor" as Risk["severity"] }));
    expect(kindIcon(container).style.color).toBe("var(--info)");
  });

  it("toggles the explanation and every ref with the chevron, and aria-expanded follows (AC-26, NFR-2)", () => {
    renderPill(risk());
    const chevron = screen.getByRole("button", { name: "Show details" });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Adds a Redis client to the request path.")).not.toBeInTheDocument();

    fireEvent.click(chevron);
    expect(screen.getByRole("button", { name: "Hide details" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Adds a Redis client to the request path.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/middleware/ratelimit.ts:12-18" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide details" }));
    expect(screen.queryByText("Adds a Redis client to the request path.")).not.toBeInTheDocument();
  });

  // NFR-1: jsdom does not turn Enter into a click and user-event is not a dependency, so
  // this pins what native button semantics need — real <button type="button"> elements
  // that take focus, stay in the tab order, and whose keydown is not cancelled — plus
  // the activation itself, for both the chevron and the risk ref.
  it("the chevron and the risk ref are native, focusable buttons that activate (NFR-1)", () => {
    const { nav } = renderPill(risk({ file_refs: ["src/a.ts:12"] }));
    const chevron = screen.getByRole("button", { name: "Show details" });
    const ref = screen.getByRole("button", { name: "src/a.ts:12" });
    for (const button of [chevron, ref]) {
      expect(button.tagName).toBe("BUTTON");
      expect(button).toHaveAttribute("type", "button");
      expect(button).not.toHaveAttribute("tabindex", "-1");
      button.focus();
      expect(document.activeElement).toBe(button);
      expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
    }
    fireEvent.click(ref);
    expect(nav.onOpen).toHaveBeenCalledWith("src/a.ts", 12);
    fireEvent.click(chevron);
    expect(screen.getByRole("button", { name: "Hide details" })).toHaveAttribute("aria-expanded", "true");
  });

  it("opens a ref in Files changed: `path:N-M` adds the start line, a bare path adds none (AC-32)", () => {
    const { nav } = renderPill(risk({ file_refs: ["src/a.ts:12-18", "package.json"] }));
    fireEvent.click(screen.getByRole("button", { name: "src/a.ts:12-18" }));
    expect(nav.onOpen).toHaveBeenLastCalledWith("src/a.ts", 12);

    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    fireEvent.click(screen.getByRole("button", { name: "package.json" }));
    expect(nav.onOpen).toHaveBeenLastCalledWith("package.json", null);
  });

  it("a ref outside the diff shows the inline message and does not navigate (AC-33)", () => {
    const { nav } = renderPill(risk({ file_refs: ["src/caller.ts:88"] }), {
      blobHref: (p, l) => `https://github.com/acme/api/blob/idx/${p}#L${l}`,
    });
    fireEvent.click(screen.getByRole("button", { name: "src/caller.ts:88" }));
    expect(nav.onOpen).not.toHaveBeenCalled();
    expect(screen.getByText(/File not in this PR's diff/)).toBeInTheDocument();
  });

  it("renders model text literally — no element, no link (AC-30)", () => {
    const xss = "<img src=x onerror=alert(1)> https://evil.example";
    const { container } = renderPill(risk({ title: xss, explanation: xss }));
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getAllByText(xss)).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });
});
