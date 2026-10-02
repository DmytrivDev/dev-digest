const { useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "density": "regular",
  "accent": "#3b82f6",
  "agentCount": 4
}/*EDITMODE-END*/;

function StudyFrame({ title, note, children, w, h }) {
  return (
    <div style={{ width: "100%", minHeight: h, background: "var(--bg-primary)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24 }}>
      <div style={{ width: w, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
          <window.Icon.Workflow size={14} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
          {note && <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" }}>{note}</span>}
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

const bg = { background: "var(--bg-primary)" };

function Root() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", t.theme);
    r.setAttribute("data-density", t.density);
    r.style.setProperty("--accent", t.accent);
    r.style.setProperty("--accent-text", t.accent);
    r.style.setProperty("--sugg", t.accent);
  }, [t.theme, t.density, t.accent]);

  return (
    <React.Fragment>
      <DesignCanvas>
        <DCSection id="core" title="Core workflow" subtitle="PR Detail — tabbed: Overview · Agent runs · Files changed">
          <DCArtboard id="pr-overview" label="PR Detail · Overview (Brief)" width={1440} height={1180} style={bg}>
            <window.ScreenPRDetail blastView="tree" tab="overview" h={1180} />
          </DCArtboard>
          <DCArtboard id="pr-runs" label="PR Detail · Agent runs (timeline + review runs)" width={1440} height={2200} style={bg}>
            <window.ScreenPRDetail blastView="tree" tab="runs" h={2200} />
          </DCArtboard>
          <DCArtboard id="pr-files" label="PR Detail · Files changed (diff)" width={1440} height={1500} style={bg}>
            <window.ScreenPRDetail blastView="tree" tab="files" h={1500} />
          </DCArtboard>
          <DCArtboard id="pr-compose" label="PR Detail · Compose Review drawer" width={1440} height={1180} style={bg}>
            <window.ScreenPRDetail blastView="tree" tab="overview" h={1180} composeOpen={true} />
          </DCArtboard>
          <DCArtboard id="dashboard" label="Pull Requests · Run Review + auto-status + Cost" width={1440} height={780} style={bg}>
            <window.ScreenDashboard h={780} />
          </DCArtboard>
          <DCArtboard id="memory" label="Memory · now incl. Learnings" width={1440} height={760} style={bg}>
            <window.ScreenMemory h={760} />
          </DCArtboard>
        </DCSection>

        <DCSection id="trace" title="Run Trace + Live Log — N10" subtitle="Opens from a timeline run · trace / log · searchable prompt blocks">
          <DCArtboard id="trace-hist" label="Run Trace · completed" width={1440} height={900} style={bg}>
            <window.ScreenTrace running={false} h={900} />
          </DCArtboard>
          <DCArtboard id="trace-prompt" label="Run Trace · prompt-block search modal" width={1440} height={900} style={bg}>
            <window.ScreenTrace running={false} h={900} promptOpen="repoSkeleton" />
          </DCArtboard>
          <DCArtboard id="trace-live" label="Run Trace · live log" width={1440} height={900} style={bg}>
            <window.ScreenTrace running={true} h={900} />
          </DCArtboard>
        </DCSection>

        <DCSection id="agents" title="Agents — N1 / N2" subtitle="Users build their own reviewers · all five editor tabs">
          <DCArtboard id="agents-empty" label="Agents · empty state" width={1180} height={680} style={bg}>
            <window.AppFrameMount empty />
          </DCArtboard>
          <DCArtboard id="agent-config" label="Agent Editor · Config" width={1280} height={860} style={bg}>
            <window.ScreenAgents tab="Config" h={860} />
          </DCArtboard>
          <DCArtboard id="agent-skills" label="Agent Editor · Skills" width={1280} height={860} style={bg}>
            <window.ScreenAgents tab="Skills" h={860} />
          </DCArtboard>
          <DCArtboard id="agent-evals" label="Agent Editor · Evals" width={1280} height={860} style={bg}>
            <window.ScreenAgents tab="Evals" h={860} />
          </DCArtboard>
          <DCArtboard id="agent-stats" label="Agent Editor · Stats" width={1280} height={1180} style={bg}>
            <window.ScreenAgents tab="Stats" h={1180} />
          </DCArtboard>
          <DCArtboard id="agent-ci" label="Agent Editor · CI" width={1280} height={860} style={bg}>
            <window.ScreenAgents tab="CI" h={860} />
          </DCArtboard>
          <DCArtboard id="evalcase" label="Eval Case Editor (N3)" width={1280} height={720} style={bg}>
            <window.ScreenEvalCase h={720} />
          </DCArtboard>
        </DCSection>

        <DCSection id="skills-lab" title="Skills Lab — Skills" subtitle="List of all skills + per-skill editor (mirrors the Agent editor)">
          <DCArtboard id="skill-config" label="Skill Editor · Config (name · type · body)" width={1280} height={920} style={bg}>
            <window.ScreenSkillsLab tab="Config" h={920} />
          </DCArtboard>
          <DCArtboard id="skill-preview" label="Skill Editor · Preview" width={1280} height={860} style={bg}>
            <window.ScreenSkillsLab tab="Preview" h={860} />
          </DCArtboard>
          <DCArtboard id="skill-evals" label="Skill Editor · Evals" width={1280} height={860} style={bg}>
            <window.ScreenSkillsLab tab="Evals" h={860} />
          </DCArtboard>
          <DCArtboard id="skill-stats" label="Skill Editor · Stats" width={1280} height={860} style={bg}>
            <window.ScreenSkillsLab tab="Stats" h={860} />
          </DCArtboard>
          <DCArtboard id="skill-versions" label="Skill Editor · Versions (body snapshots)" width={1280} height={860} style={bg}>
            <window.ScreenSkillsLab tab="Versions" h={860} />
          </DCArtboard>
          <DCArtboard id="skill-community" label="Skills · Community search drawer" width={1280} height={920} style={bg}>
            <window.ScreenSkillsLab tab="Config" searchOpen={true} h={920} />
          </DCArtboard>
        </DCSection>

        <DCSection id="multiagent" title="Multi-Agent Review — N4" subtitle="Dynamic columns = enabled agents (try the Agents tweak)">
          <DCArtboard id="ma-cols" label="Columns" width={1440} height={1120} style={bg}>
            <window.ScreenMultiAgent view="columns" agentCount={t.agentCount} h={1120} />
          </DCArtboard>
          <DCArtboard id="ma-tabs" label="Tabs + detail" width={1440} height={1120} style={bg}>
            <window.ScreenMultiAgent view="tabs" agentCount={t.agentCount} h={1120} />
          </DCArtboard>
        </DCSection>

        <DCSection id="ci" title="CI & Export — N11 / N12 / N13" subtitle="Ship agents to CI and watch them run">
          <DCArtboard id="agent-perf" label="Agent Performance (N11)" width={1440} height={920} style={bg}>
            <window.ScreenAgentPerf h={920} />
          </DCArtboard>
          <DCArtboard id="export" label="Export to CI Wizard (N12)" width={1180} height={720} style={bg}>
            <window.ScreenExport h={720} />
          </DCArtboard>
          <DCArtboard id="ci-runs" label="CI Runs (N13)" width={1440} height={720} style={bg}>
            <window.ScreenCIRuns h={720} />
          </DCArtboard>
        </DCSection>

        <DCSection id="settings" title="Settings — N9" subtitle="Automatic Reviews + Integrations">
          <DCArtboard id="set-auto" label="Settings · Automatic Reviews" width={1280} height={760} style={bg}>
            <window.ScreenSettings section="Automatic Reviews" h={760} />
          </DCArtboard>
          <DCArtboard id="set-int" label="Settings · Integrations" width={1280} height={760} style={bg}>
            <window.ScreenSettings section="Integrations" h={760} />
          </DCArtboard>
        </DCSection>

        <DCSection id="repo" title="Repo intelligence — N5 / N6 / N7 / N8" subtitle="Onboarding, context, conventions, conformance">
          <DCArtboard id="tour" label="Onboarding Tour (N5)" width={1280} height={1560} style={bg}>
            <window.ScreenTour h={1560} />
          </DCArtboard>
          <DCArtboard id="context" label="Project Context (N6)" width={1280} height={760} style={bg}>
            <window.ScreenContext h={760} />
          </DCArtboard>
          <DCArtboard id="conventions" label="Conventions (N7)" width={1280} height={860} style={bg}>
            <window.ScreenConventions h={860} />
          </DCArtboard>
          <DCArtboard id="conv-create" label="Conventions · Create skill (merged from accepted)" width={1280} height={860} style={bg}>
            <window.ScreenConventions h={860} createOpen={true} />
          </DCArtboard>
          <DCArtboard id="conformance" label="Conformance Report (N8)" width={1280} height={760} style={bg}>
            <window.ScreenConformance h={760} />
          </DCArtboard>
        </DCSection>

        <DCSection id="empties" title="Empty states" subtitle="Every new screen has a considered first-run">
          <DCArtboard id="e-ci" label="CI Runs · empty" width={1180} height={640} style={bg}>
            <window.ScreenCIRuns h={640} empty />
          </DCArtboard>
          <DCArtboard id="e-tour" label="Onboarding Tour · empty" width={1180} height={640} style={bg}>
            <window.ScreenTour h={640} empty />
          </DCArtboard>
          <DCArtboard id="e-context" label="Project Context · empty" width={1180} height={640} style={bg}>
            <window.ScreenContext h={640} empty />
          </DCArtboard>
          <DCArtboard id="e-conv" label="Conventions · empty" width={1180} height={640} style={bg}>
            <window.ScreenConventions h={640} empty />
          </DCArtboard>
          <DCArtboard id="e-ma" label="Multi-Agent · no agents" width={1180} height={640} style={bg}>
            <window.ScreenMultiAgent agentCount={0} h={640} />
          </DCArtboard>
        </DCSection>

        <DCSection id="firstrun" title="First run & open questions" subtitle="Onboarding wizard + the blast-radius study">
          <DCArtboard id="onboarding" label="Onboarding · First run" width={960} height={720} style={bg}>
            <window.ScreenOnboarding h={720} />
          </DCArtboard>
          <DCArtboard id="blast-tree" label="Blast radius · Tree (default)" width={620} height={470} style={bg}>
            <StudyFrame title="Blast radius" note="14 callers · 3 endpoints" w={572} h={470}>
              <window.BlastRadius view="tree" />
            </StudyFrame>
          </DCArtboard>
          <DCArtboard id="blast-graph" label="Blast radius · Graph drill-in" width={620} height={470} style={bg}>
            <StudyFrame title="Blast radius" note="hierarchical node-link" w={572} h={470}>
              <window.BlastRadius view="graph" />
            </StudyFrame>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakRadio label="Mode" value={t.theme} options={["dark", "light"]} onChange={(v) => setTweak("theme", v)} />
        <TweakColor label="Accent" value={t.accent} options={["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"]} onChange={(v) => setTweak("accent", v)} />
        <TweakSection label="Density" />
        <TweakRadio label="Spacing" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Multi-Agent Review" />
        <TweakSlider label="Enabled agents" value={t.agentCount} min={2} max={5} step={1} onChange={(v) => setTweak("agentCount", v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

// Agents empty-state mount helper (wraps the empty list in the app frame)
window.AppFrameMount = function ({ empty }) {
  return React.createElement(window.AppFrame, { active: "agents", h: 680, crumb: [{ label: "Skills Lab" }, { label: "Agents" }] },
    React.createElement("div", { style: { display: "flex", height: 628 } },
      React.createElement("div", { style: { width: 280, flexShrink: 0, borderRight: "1px solid var(--border)", background: "var(--bg-surface)", padding: 14 } },
        React.createElement("h1", { style: { fontSize: 16, fontWeight: 700 } }, "Agents")),
      React.createElement(window.AgentsEmpty)));
};

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
