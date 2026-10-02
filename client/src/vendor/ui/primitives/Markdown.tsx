import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Elements an `untrusted` document may never render: an `<img>` makes the
    browser fetch a remote URL the moment the preview opens (NFR-5). */
const UNTRUSTED_DISALLOWED = ["img"];

/** Markdown renderer (replaces prototype mdLite). Inline + GFM.
    `untrusted` is for text written by someone else (a document from a repo): no
    `<img>`. Raw HTML is already inert here (no rehype-raw: it renders as text)
    and `javascript:` links stay blanked by the default URL transform — so do not
    pass a custom `urlTransform`, it would replace that default. */
export function Markdown({
  children,
  untrusted = false,
}: {
  children?: string | null;
  untrusted?: boolean;
}) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={untrusted ? UNTRUSTED_DISALLOWED : undefined}
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
