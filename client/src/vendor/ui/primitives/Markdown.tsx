import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Elements an `untrusted` document may never render: an `<img>` makes the
    browser fetch a remote URL the moment the preview opens (NFR-5). */
const UNTRUSTED_DISALLOWED = ["img"];

/** Elements `noLinks` removes while keeping their text (incl. inline `<code>`). */
const NO_LINKS_DISALLOWED = ["a"];

/** Markdown renderer (replaces prototype mdLite). Inline + GFM.
    `untrusted` is for text written by someone else (a document from a repo): no
    `<img>`. Raw HTML is already inert here (no rehype-raw: it renders as text)
    and `javascript:` links stay blanked by the default URL transform — so do not
    pass a custom `urlTransform`, it would replace that default.
    `noLinks` renders every link as its text (for prose that must stay inert). */
export function Markdown({
  children,
  untrusted = false,
  noLinks = false,
}: {
  children?: string | null;
  untrusted?: boolean;
  noLinks?: boolean;
}) {
  if (!children) return null;
  const disallowed = [
    ...(untrusted ? UNTRUSTED_DISALLOWED : []),
    ...(noLinks ? NO_LINKS_DISALLOWED : []),
  ];
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={disallowed.length > 0 ? disallowed : undefined}
        unwrapDisallowed={noLinks}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.92em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--bg-hover)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
