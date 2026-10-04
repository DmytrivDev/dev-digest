import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));

// mermaid cannot lay out under jsdom — the component's contract with it is what is tested.
vi.mock("mermaid", () => ({ default: mermaid }));

import { MermaidDiagram } from "./MermaidDiagram";
import { ThemeProvider, useTheme } from "@/lib/theme";

const CHART = "graph TD\n  A --> B";

function ThemeButtons() {
  const { set } = useTheme();
  return (
    <>
      <button onClick={() => set("light")}>light</button>
      <button onClick={() => set("dark")}>dark</button>
    </>
  );
}

beforeEach(() => {
  mermaid.initialize.mockReset();
  mermaid.parse.mockReset().mockResolvedValue(true);
  mermaid.render.mockReset().mockResolvedValue({ svg: "<svg></svg>" });
});
afterEach(cleanup);

describe("MermaidDiagram", () => {
  it("renders the fallback when mermaid.parse rejects the source (AC-79)", async () => {
    mermaid.parse.mockResolvedValue(false);
    render(<MermaidDiagram chart={CHART} fallback={<p>Diagram unavailable</p>} />);
    expect(await screen.findByText("Diagram unavailable")).toBeInTheDocument();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("renders the fallback for text that is not a diagram, without calling mermaid", async () => {
    render(<MermaidDiagram chart={"just prose"} fallback={<p>Diagram unavailable</p>} />);
    expect(await screen.findByText("Diagram unavailable")).toBeInTheDocument();
    expect(mermaid.initialize).not.toHaveBeenCalled();
  });

  it("renders nothing for an invalid chart when no fallback is given", async () => {
    mermaid.parse.mockResolvedValue(false);
    const { container } = render(<MermaidDiagram chart={CHART} />);
    await waitFor(() => expect(mermaid.parse).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("follows the app theme: dark, then light, then dark again, re-rendering each time (AC-80)", async () => {
    render(
      <ThemeProvider>
        <ThemeButtons />
        <MermaidDiagram chart={CHART} />
      </ThemeProvider>,
    );
    const modes = () => mermaid.initialize.mock.calls.map(([cfg]) => cfg.darkMode);

    await waitFor(() => expect(modes()).toEqual([true]));
    fireEvent.click(screen.getByText("light"));
    await waitFor(() => expect(modes()).toEqual([true, false]));
    fireEvent.click(screen.getByText("dark"));
    await waitFor(() => expect(modes()).toEqual([true, false, true]));
    // One base theme painted with the app tokens, whichever mode.
    expect(new Set(mermaid.initialize.mock.calls.map(([cfg]) => cfg.theme))).toEqual(new Set(["base"]));
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(3));
  });

  it("never initializes mermaid with a securityLevel other than strict (NFR-6)", async () => {
    render(
      <ThemeProvider>
        <ThemeButtons />
        <MermaidDiagram chart={CHART} />
      </ThemeProvider>,
    );
    await waitFor(() => expect(mermaid.initialize).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("light"));
    await waitFor(() => expect(mermaid.initialize).toHaveBeenCalledTimes(2));
    for (const [cfg] of mermaid.initialize.mock.calls) {
      expect(cfg.securityLevel).toBe("strict");
    }
  });
});
