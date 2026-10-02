import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { Markdown } from "./Markdown";

afterEach(cleanup);

/** Every element under `root` carrying an `on*` attribute. */
function withEventHandlerAttr(root: Element): Element[] {
  return Array.from(root.querySelectorAll("*")).filter((el) =>
    el.getAttributeNames().some((n) => n.toLowerCase().startsWith("on")),
  );
}

describe("Markdown untrusted", () => {
  it("renders no script, no img and no on* attribute for raw HTML", () => {
    const { container } = render(
      <Markdown untrusted>
        {"# Doc\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\ntext"}
      </Markdown>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(withEventHandlerAttr(container)).toEqual([]);
  });

  it("drops an inline image so no remote URL is requested", () => {
    const { container } = render(
      <Markdown untrusted>{"before ![x](https://example.com/a.png) after"}</Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("drops a reference-style image", () => {
    const { container } = render(
      <Markdown untrusted>{"![x][pic]\n\n[pic]: https://example.com/a.png"}</Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("blanks a javascript: link target", () => {
    const { container } = render(<Markdown untrusted>{"[go](javascript:alert(1))"}</Markdown>);
    const a = container.querySelector("a");
    expect(a?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("still renders markdown structure", () => {
    render(<Markdown untrusted>{"# Title"}</Markdown>);
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
  });
});

describe("Markdown (default)", () => {
  it("keeps rendering images for trusted callers", () => {
    const { container } = render(<Markdown>{"![x](https://example.com/a.png)"}</Markdown>);
    expect(container.querySelector("img")).not.toBeNull();
  });
});
