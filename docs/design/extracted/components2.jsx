/* components2.jsx — iteration #2 reusable components */

const MODEL_COLOR = { "gpt-4.1": "#3b82f6", "gpt-4o": "#10b981", "gpt-4o-mini": "#8b5cf6", "o1": "#f59e0b" };

function AgentCard({ ag, active, onClick }) {
  const [en, setEn] = React.useState(ag.enabled);
  return React.createElement("div", { onClick,
    style: { padding: 13, borderRadius: 8, cursor: "pointer", border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
      background: active ? "var(--bg-hover)" : "var(--bg-elevated)", opacity: en ? 1 : 0.6, marginBottom: 8 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      React.createElement("div", { style: { width: 26, height: 26, borderRadius: 7, background: "var(--accent-bg)", color: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 } }, React.createElement(window.Icon.Cpu, { size: 15 })),
      React.createElement("span", { style: { fontSize: 13.5, fontWeight: 600, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, ag.name),
      React.createElement("div", { onClick: (e) => { e.stopPropagation(); setEn(!en); } }, React.createElement(window.Toggle, { on: en, onChange: setEn, size: 14 }))),
    React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", margin: "7px 0", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, ag.description),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7 } },
      React.createElement("span", { className: "mono", style: { fontSize: 10.5, fontWeight: 600, color: MODEL_COLOR[ag.model] || "var(--text-secondary)", background: (MODEL_COLOR[ag.model] || "var(--text-secondary)") + "1a", padding: "1px 6px", borderRadius: 4 } }, ag.model),
      React.createElement(window.Badge, { color: "var(--text-secondary)", icon: "Sparkles" }, ag.skills.length + " skills")),
    ag.stats7d && React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)" } },
      React.createElement("span", { className: "tnum" }, ag.stats7d.runs + " runs"),
      React.createElement("span", { className: "tnum", style: { color: ag.stats7d.accept >= 0.6 ? "var(--ok)" : "var(--warn)" } }, Math.round(ag.stats7d.accept * 100) + "% accept"),
      React.createElement("span", { className: "mono tnum" }, "$" + ag.stats7d.cost.toFixed(2) + " avg")));
}

function RunReviewDropdown({ size = "sm", kind = "primary" }) {
  const items = [
    { label: "Run all enabled agents", icon: "Play" }, { divider: true },
    ...window.AGENTS.filter((a) => a.enabled).map((a) => ({ label: a.name, icon: "Cpu", hint: "~" + Math.round(a.stats7d.cost * 0 + 6) + "s" })),
    { divider: true }, { label: "Configure agents…", icon: "Settings", muted: true },
  ];
  return React.createElement(window.Dropdown, { width: 240, align: "right",
    trigger: React.createElement(window.Button, { kind, size, iconRight: "ChevronDown", icon: "Sparkles" }, "Run Review"),
    items });
}

function AutoTriggerStatus({ on = true }) {
  return React.createElement("button", { title: "Settings → Automatic Reviews",
    style: { display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 11px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: 12, color: "var(--text-secondary)" } },
    React.createElement("span", { style: { width: 7, height: 7, borderRadius: 99, background: on ? "var(--ok)" : "var(--text-muted)", boxShadow: on ? "0 0 0 3px var(--ok-bg)" : "none", animation: on ? "ddpulse 2s ease-in-out infinite" : "none" } }),
    React.createElement("span", null, "Auto-review: ", React.createElement("b", { style: { color: on ? "var(--ok)" : "var(--text-muted)", fontWeight: 600 } }, on ? "ON" : "OFF")),
    on && React.createElement("span", { style: { color: "var(--text-muted)" } }, "· polling 5m · 2 agents"));
}

function EvalCaseRow({ ec, onClick }) {
  const map = { pass: { icon: "CheckCircle", c: "var(--ok)" }, fail: { icon: "XCircle", c: "var(--crit)" }, never: { icon: "Dot", c: "var(--text-muted)" } };
  const m = map[ec.status];
  const [h, setH] = React.useState(false);
  return React.createElement("div", { onClick, onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    style: { display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 7, border: "1px solid var(--border)", background: h ? "var(--bg-hover)" : "var(--bg-elevated)", cursor: "pointer", marginBottom: 6 } },
    React.createElement(window.Icon[m.icon], { size: 15, style: { color: m.c, flexShrink: 0 } }),
    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
      React.createElement("div", { className: "mono", style: { fontSize: 12.5, fontWeight: 600 } }, ec.name),
      React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } }, ec.result)),
    React.createElement(window.Badge, { color: "var(--text-muted)" }, ec.expected),
    React.createElement("div", { style: { display: "flex", gap: 2, opacity: h ? 1 : 0.4 } },
      React.createElement(window.IconBtn, { icon: "Play", label: "Run", size: 26 }),
      React.createElement(window.IconBtn, { icon: "Edit", label: "Edit", size: 26 }),
      React.createElement(window.IconBtn, { icon: "Trash", label: "Delete", size: 26, danger: true })));
}

function LiveLogStream({ log, running, height = 260 }) {
  const KC = { info: "var(--accent-text)", result: "var(--ok)", tool: "var(--warn)", error: "var(--crit)" };
  return React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--code-bg)" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, padding: "3px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-elevated)", width: 150 } },
        React.createElement(window.Icon.Search, { size: 12, style: { color: "var(--text-muted)" } }),
        React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, "Filter log…")),
      running
        ? React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--warn)", fontWeight: 600 } }, React.createElement("span", { style: { width: 7, height: 7, borderRadius: 99, background: "var(--warn)", animation: "ddpulse 1s infinite" } }), "Running 4.2s")
        : React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, log.length + " lines"),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 2 } },
        React.createElement(window.IconBtn, { icon: "RefreshCw", label: "Replay 4x", size: 26 }),
        React.createElement(window.IconBtn, { icon: "Copy", label: "Copy log", size: 26 }))),
    React.createElement("div", { style: { height, overflow: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3 } },
      log.map((l, i) => React.createElement("div", { key: i, className: "mono", style: { fontSize: 11.5, lineHeight: 1.5, display: "flex", gap: 8, animation: "ddfadein .2s ease" } },
        React.createElement("span", { style: { color: "var(--text-muted)", flexShrink: 0 } }, "[" + l.t + "]"),
        React.createElement("span", { style: { color: KC[l.k], flexShrink: 0, fontWeight: 600 } }, "[" + l.k + "]"),
        React.createElement("span", { style: { color: "var(--text-primary)" } }, l.m))),
      running && React.createElement("div", { className: "mono", style: { fontSize: 11.5, color: "var(--text-muted)" } }, React.createElement("span", { style: { display: "inline-block", width: 7, height: 13, background: "var(--ok)", animation: "ddpulse 1s infinite", verticalAlign: "middle" } }))));
}

function ExportWizardSteps({ step, labels }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 0, padding: "0 4px" } },
    labels.map((l, i) => React.createElement(React.Fragment, { key: i },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("div", { style: { width: 24, height: 24, borderRadius: 99, display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 700, flexShrink: 0,
          background: i < step ? "var(--ok)" : i === step ? "var(--accent)" : "var(--bg-elevated)", color: i <= step ? "#fff" : "var(--text-muted)", border: i > step ? "1px solid var(--border-strong)" : "none" } },
          i < step ? React.createElement(window.Icon.Check, { size: 13 }) : (i + 1)),
        React.createElement("span", { style: { fontSize: 12.5, fontWeight: i === step ? 600 : 500, color: i <= step ? "var(--text-primary)" : "var(--text-muted)", whiteSpace: "nowrap" } }, l)),
      i < labels.length - 1 && React.createElement("div", { style: { flex: 1, height: 1, minWidth: 24, background: i < step ? "var(--ok)" : "var(--border-strong)", margin: "0 12px" } }))));
}

Object.assign(window, { AgentCard, RunReviewDropdown, AutoTriggerStatus, EvalCaseRow, LiveLogStream, ExportWizardSteps, MODEL_COLOR });
