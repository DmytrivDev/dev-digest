/* screen_multiagent.jsx — N4 Multi-Agent Review (dynamic columns + tabs) */

function AgentFindingMini({ f }) {
  const s = window.SEV[f.severity];
  return React.createElement("div", { style: { padding: "8px 10px", borderRadius: 6, background: "var(--bg-surface)", borderLeft: "2px solid " + s.c } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
      React.createElement(window.Icon[s.icon], { size: 12, style: { color: s.c, flexShrink: 0 } }),
      React.createElement("span", { style: { fontSize: 12, fontWeight: 600, lineHeight: 1.3 } }, f.title)),
    React.createElement("div", { className: "mono", style: { fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 } }, f.file + ":" + f.start_line));
}

function AgentColHeader({ p }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9 } },
    React.createElement("div", { style: { width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", background: p.color + "1f", color: p.color, flexShrink: 0 } }, React.createElement(window.Icon[p.icon], { size: 16 })),
    React.createElement("div", { style: { minWidth: 0, flex: 1 } },
      React.createElement("div", { style: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, p.name),
      React.createElement("div", { className: "mono tnum", style: { fontSize: 10.5, color: "var(--text-muted)" } }, (p.duration_ms / 1000).toFixed(1) + "s · $" + p.cost.toFixed(2))),
    React.createElement(window.CircularScore, { score: p.score, size: 32, stroke: 3.5 }));
}

function ConflictsSection() {
  return React.createElement("div", { style: { marginTop: 22 } },
    React.createElement(window.SectionLabel, { icon: "Activity", right: React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-secondary)" } }, "Show only conflicts", React.createElement(window.Toggle, { on: false, onChange: () => {}, size: 15 })) }, "Where agents disagree"),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
      window.PERSONA_CONFLICTS.map((c, i) => React.createElement("div", { key: i, style: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" } },
          React.createElement(window.Icon.Code, { size: 13, style: { color: "var(--text-muted)" } }),
          React.createElement("span", { className: "mono", style: { fontSize: 12 } }, c.file + ":" + c.line),
          React.createElement("span", { style: { fontSize: 13, fontWeight: 600, marginLeft: 6 } }, c.title)),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(" + c.takes.length + ", 1fr)", gap: 1, background: "var(--border)" } },
          c.takes.map((t, ti) => {
            const flagged = t.verdict !== "ignored";
            return React.createElement("div", { key: ti, style: { padding: "10px 14px", background: "var(--bg-elevated)" } },
              React.createElement("div", { style: { fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 } }, t.persona),
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, marginBottom: 4 } },
                React.createElement("span", { style: { width: 7, height: 7, borderRadius: 99, background: flagged ? (window.SEV[t.verdict] ? window.SEV[t.verdict].c : "var(--warn)") : "var(--text-muted)" } }),
                React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: flagged ? "var(--text-primary)" : "var(--text-muted)", textTransform: flagged ? "uppercase" : "none", letterSpacing: flagged ? "0.03em" : 0 } }, flagged ? t.verdict : "did not flag")),
              React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.4 } }, t.note));
          }))))));
}

function MetaRow({ agents }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "14px 28px", borderBottom: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-secondary)" } },
    React.createElement("span", { className: "mono", style: { color: "var(--text-muted)" } }, "#482"),
    React.createElement("span", { style: { fontWeight: 600, color: "var(--text-primary)" } }, "Add rate limiting to public API endpoints"),
    React.createElement("span", { style: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 } },
      React.createElement(window.Icon.Cpu, { size: 14, style: { color: "var(--accent)" } }), agents.length + " agents · fan-out via worktrees · 7.3s total · $0.18"));
}

function ColumnsView({ agents }) {
  const n = agents.length;
  const cols = n <= 2 ? n : n <= 5 ? n : 5;
  return React.createElement("div", { style: { padding: "20px 28px 40px" } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(" + cols + ", minmax(220px, 1fr))", gap: 12, overflowX: n > 5 ? "auto" : "visible" } },
      agents.map((p, i) => React.createElement("div", { key: i, style: { border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg-elevated)", display: "flex", flexDirection: "column", overflow: "hidden" } },
        React.createElement("div", { style: { padding: 12, borderBottom: "1px solid var(--border)", borderTop: "2px solid " + p.color } }, React.createElement(AgentColHeader, { p })),
        React.createElement("div", { style: { padding: 12, display: "flex", flexDirection: "column", gap: 7, flex: 1 } },
          p.findings.map((f, fi) => React.createElement(AgentFindingMini, { key: fi, f }))),
        React.createElement("div", { style: { padding: "9px 12px", borderTop: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "space-between" } },
          React.createElement(window.MonoLink, null, "View trace"),
          React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)" } }, p.findings.length + " findings"))))),
    React.createElement(ConflictsSection));
}

function TabsView({ agents }) {
  const [sel, setSel] = React.useState(0);
  const p = agents[sel];
  return React.createElement("div", { style: { padding: "0 0 40px" } },
    React.createElement("div", { style: { display: "flex", gap: 2, padding: "0 28px", borderBottom: "1px solid var(--border)", overflowX: "auto" } },
      agents.map((pp, i) => {
        const on = sel === i;
        return React.createElement("button", { key: i, onClick: () => setSel(i), style: { display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", border: "none", background: "transparent", borderBottom: "2px solid " + (on ? pp.color : "transparent"), marginBottom: -1, cursor: "pointer", whiteSpace: "nowrap" } },
          React.createElement(window.Icon[pp.icon], { size: 15, style: { color: on ? pp.color : "var(--text-muted)" } }),
          React.createElement("span", { style: { fontSize: 13, fontWeight: on ? 600 : 500, color: on ? "var(--text-primary)" : "var(--text-secondary)" } }, pp.name),
          React.createElement("span", { className: "tnum", style: { fontSize: 11, fontWeight: 700, color: pp.score >= 70 ? "var(--ok)" : pp.score >= 50 ? "var(--warn)" : "var(--crit)" } }, pp.score));
      })),
    React.createElement("div", { style: { padding: "20px 28px", maxWidth: 760 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)", marginBottom: 18, borderLeft: "3px solid " + p.color } },
        React.createElement(window.CircularScore, { score: p.score, size: 44 }),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: p.color } }, p.name),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 } }, p.summary)),
        React.createElement("div", { style: { marginLeft: "auto", textAlign: "right", display: "flex", flexDirection: "column", gap: 4 } },
          React.createElement(window.MonoLink, null, "View trace"),
          React.createElement("span", { className: "mono tnum", style: { fontSize: 11, color: "var(--text-muted)" } }, (p.duration_ms / 1000).toFixed(1) + "s · $" + p.cost.toFixed(2)))),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
        p.findings.map((f, fi) => React.createElement(window.FindingCard, { key: fi, f, idx: fi })))),
    React.createElement("div", { style: { padding: "0 28px" } }, React.createElement(ConflictsSection)));
}

function ScreenMultiAgent({ view = "columns", agentCount = 4, h = 1000 }) {
  const agents = window.PERSONAS.slice(0, agentCount);
  const [v, setV] = React.useState(view);
  React.useEffect(() => setV(view), [view]);
  if (agentCount === 0) return React.createElement(window.AppFrame, { active: "personas", h, crumb: [{ label: "Multi-Agent Review" }] },
    React.createElement(window.EmptyState, { icon: "Cpu", title: "Enable agents to run reviews", body: "Multi-agent review runs the PR through every enabled agent in parallel. You have no agents enabled yet.", cta: "Go to Agents" }));
  return React.createElement(window.AppFrame, { active: "personas", h, crumb: [{ label: "Multi-Agent Review" }, { label: "#482", mono: true }] },
    React.createElement("div", { style: { padding: "18px 28px 4px", display: "flex", alignItems: "center", gap: 12 } },
      React.createElement("h1", { style: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" } }, "Multi-Agent Review"),
      React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-muted)" } }, "this PR through every enabled agent in parallel"),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 2, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7, padding: 2 } },
        ["columns", "tabs"].map((k) => React.createElement("button", { key: k, onClick: () => setV(k),
          style: { padding: "4px 12px", fontSize: 11.5, fontWeight: 600, borderRadius: 5, border: "none", textTransform: "capitalize",
            background: v === k ? "var(--bg-elevated)" : "transparent", color: v === k ? "var(--text-primary)" : "var(--text-muted)" } }, k)))),
    React.createElement(MetaRow, { agents }),
    v === "columns" ? React.createElement(ColumnsView, { agents }) : React.createElement(TabsView, { agents }));
}

Object.assign(window, { ScreenMultiAgent });
