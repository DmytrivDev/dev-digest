import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// jsdom gives ResponsiveContainer a 0x0 box, so Recharts draws nothing. A fixed
// size makes it lay the chart out the way the browser would.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 600, height: 200 } as object),
  };
});

import { LineChart } from "./LineChart";

afterEach(cleanup);

const A = { name: "a", color: "var(--accent)", data: [0.2, 0.4, 0.6, 0.8] };
const B = { name: "b", color: "var(--ok)", data: [0.2, null, 0.6, 0.8] };

function dotsOf(container: HTMLElement) {
  return container.querySelectorAll(".recharts-line-dot");
}

/** Pointer over the plot area, near the x of point `i` of 4. */
function hover(container: HTMLElement, i: number) {
  const wrapper = container.querySelector(".recharts-wrapper") as HTMLElement;
  // plot spans x = 28 .. 586 for the 600-wide chart (left margin -10 + y axis 38, right margin 14)
  const x = 28 + ((586 - 28) / 3) * i;
  fireEvent.mouseMove(wrapper, { clientX: x, clientY: 100 });
}

describe("LineChart — without the new options (AC-58)", () => {
  it("is not focusable, has no group role and shows no tooltip on hover", () => {
    const { container } = render(<LineChart series={[A]} yMin={0} yMax={1} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute("tabindex");
    expect(root).not.toHaveAttribute("role");
    expect(root).not.toHaveAttribute("aria-label");
    hover(container, 1);
    expect(screen.queryByRole("tooltip")).toBeNull();
    // `dot={false}` stays the default: no dot is drawn.
    expect(dotsOf(container)).toHaveLength(0);
  });

  it("keeps drawing the explicit y ticks it is given", () => {
    const { container } = render(
      <LineChart series={[A]} yMin={0} yMax={1} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} />,
    );
    const labels = Array.from(container.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick-value")).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["0.0", "0.2", "0.4", "0.6", "0.8", "1.0"]);
  });
});

describe("LineChart — dots and gaps (AC-53)", () => {
  it("draws a dot per point when `dots` is on", () => {
    const { container } = render(<LineChart series={[A]} yMin={0} yMax={1} dots />);
    expect(dotsOf(container)).toHaveLength(4);
  });

  it("leaves a null as a gap, not as a 0 point", () => {
    const { container } = render(<LineChart series={[A, B]} yMin={0} yMax={1} dots />);
    // 4 dots for A, 3 for B: the null point of B is not drawn at 0.
    expect(dotsOf(container)).toHaveLength(7);
  });

  it("still pads a SHORTER series with 0, as before", () => {
    const short = { name: "s", color: "var(--warn)", data: [0.5] };
    const { container } = render(<LineChart series={[A, short]} yMin={0} yMax={1} dots />);
    expect(dotsOf(container)).toHaveLength(8);
  });
});

describe("LineChart — tooltip (NFR-2, NFR-3)", () => {
  const tooltip = {
    label: "Chart by run",
    render: (i: number) => `point ${i}`,
  };

  it("makes the chart a labelled, focusable group", () => {
    const { container } = render(<LineChart series={[A]} yMin={0} yMax={1} tooltip={tooltip} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("group", { name: "Chart by run" })).toBe(root);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("focus selects the newest point; the arrows, Home, End and Escape move it", () => {
    render(<LineChart series={[A]} yMin={0} yMax={1} tooltip={tooltip} />);
    const group = screen.getByRole("group");
    fireEvent.focus(group);
    expect(screen.getByRole("tooltip")).toHaveTextContent("point 3");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("point 2");
    fireEvent.keyDown(group, { key: "Home" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("point 0");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("point 0");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("point 1");
    fireEvent.keyDown(group, { key: "End" });
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("point 3");
    fireEvent.keyDown(group, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("point 2");
    fireEvent.blur(group);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("points the group at the tooltip it is showing", () => {
    render(<LineChart series={[A]} yMin={0} yMax={1} tooltip={tooltip} />);
    const group = screen.getByRole("group");
    expect(group).not.toHaveAttribute("aria-describedby");
    fireEvent.focus(group);
    expect(group).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
  });

  it("shows the point under the pointer and hides it when the pointer leaves", () => {
    const { container } = render(<LineChart series={[A]} yMin={0} yMax={1} tooltip={tooltip} />);
    hover(container, 1);
    expect(screen.getByRole("tooltip")).toHaveTextContent("point 1");
    hover(container, 2);
    expect(screen.getByRole("tooltip")).toHaveTextContent("point 2");
    fireEvent.mouseLeave(screen.getByRole("group"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("renders what `render` returns as text, never as markup", () => {
    const evil = '<img src=x onerror="window.__pwned = 1">';
    const { container } = render(
      <LineChart series={[A]} yMin={0} yMax={1} tooltip={{ label: "c", render: () => evil }} />,
    );
    fireEvent.focus(screen.getByRole("group"));
    expect(screen.getByRole("tooltip")).toHaveTextContent(evil);
    expect(container.querySelector("img")).toBeNull();
  });
});
