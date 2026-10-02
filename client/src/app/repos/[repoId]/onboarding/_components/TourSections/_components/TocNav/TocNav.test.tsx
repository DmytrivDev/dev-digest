import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { SECTION_KINDS } from "../../constants";
import { TocNav } from "./TocNav";

afterEach(cleanup);

const withIntl = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
    {ui}
  </NextIntlClientProvider>
);

describe("TocNav", () => {
  it("links to the five sections in page order (AC-90, AC-92)", () => {
    render(withIntl(<TocNav />));
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "#architecture_overview",
      "#critical_paths",
      "#how_to_run",
      "#guided_reading",
      "#first_tasks",
    ]);
    expect(links.map((a) => a.textContent)).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
  });

  it("marks the first section current before any scrolling", () => {
    render(withIntl(<TocNav />));
    expect(screen.getByRole("link", { name: "Architecture overview" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("link", { name: "First tasks" })).not.toHaveAttribute("aria-current");
  });

  it("moves aria-current to the section in view when <main> scrolls (AC-92)", () => {
    // jsdom has no layout: the sections' tops are stubbed, the scroll is real.
    let tops = [10, 400, 800, 1200, 1600];
    render(
      <main>
        {SECTION_KINDS.map((kind, i) => {
          return (
            <section
              key={kind}
              id={kind}
              ref={(el) => {
                if (el) el.getBoundingClientRect = () => ({ top: tops[i] ?? 0 }) as DOMRect;
              }}
            />
          );
        })}
        {withIntl(<TocNav />)}
      </main>,
    );
    const main = document.querySelector("main") as HTMLElement;
    main.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;

    tops = [-900, -500, -10, 300, 800];
    fireEvent.scroll(main);

    expect(screen.getByRole("link", { name: "How to run locally" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getAllByRole("link").filter((a) => a.hasAttribute("aria-current"))).toHaveLength(1);
  });
});
