import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkSpec } from "./check-specs.mjs";

const SCRIPT = resolve(import.meta.dirname, "check-specs.mjs");
const MARK = (n, q = "which one?") => `[NEEDS CLARIFICATION: OQ-${n} — ${q}]`;

/** Build a spec: status line, optional body lines, and an Open questions section. */
function spec({ status = "draft", body = [], open = [] } = {}) {
  return [
    "# Spec: Fixture",
    "Spec ID: SPEC-99",
    `Status: ${status}`,
    "",
    "## Acceptance criteria",
    ...body,
    "",
    "## Open questions",
    ...open,
    "",
    "## Design review",
    "nothing",
    "",
  ].join("\n");
}

describe("checkSpec", () => {
  it("(a) draft without a marker passes", () => {
    assert.deepEqual(checkSpec(spec(), "x.md").violations, []);
  });

  it("(b) approved without a marker passes", () => {
    assert.deepEqual(checkSpec(spec({ status: "approved" }), "x.md").violations, []);
  });

  it("(c) approved + one mirrored marker -> exactly one violation at the marker line", () => {
    const text = spec({ status: "approved", body: [`- AC-1: ${MARK(1)}`], open: ["- OQ-1 → AC-1 — which one?"] });
    const { violations } = checkSpec(text, "x.md");
    assert.equal(violations.length, 1);
    assert.equal(violations[0].line, 6);
    assert.match(violations[0].message, /marker in a spec with Status: approved/);
  });

  it("(d) implemented + marker -> violation", () => {
    const text = spec({ status: "implemented", body: [`- AC-1: ${MARK(1)}`], open: ["- OQ-1 → AC-1 — q"] });
    const { violations } = checkSpec(text, "x.md");
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /marker in a spec with Status: implemented/);
  });

  it("(e) draft with 3 mirrored markers passes", () => {
    const text = spec({
      body: [MARK(1), MARK(2), MARK(3)],
      open: ["- OQ-1 → AC-1 — a", "- OQ-2 → AC-2 — b", "- OQ-3 → AC-3 — c"],
    });
    const res = checkSpec(text, "x.md");
    assert.equal(res.markers.length, 3);
    assert.deepEqual(res.violations, []);
  });

  it("(f) draft with 4 mirrored markers -> cap violation at the 4th marker", () => {
    const text = spec({
      body: [MARK(1), MARK(2), MARK(3), MARK(4)],
      open: ["- OQ-1 → a", "- OQ-2 → b", "- OQ-3 → c", "- OQ-4 → d"],
    });
    const { violations } = checkSpec(text, "x.md");
    assert.equal(violations.length, 1);
    assert.equal(violations[0].line, 9);
    assert.match(violations[0].message, /4 markers \(max 3\)/);
  });

  it("(g) marker OQ-2 with only OQ-1 under Open questions -> mirroring violation", () => {
    const text = spec({ body: [MARK(2)], open: ["- OQ-1 → AC-1 — other"] });
    const { violations } = checkSpec(text, "x.md");
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /OQ-2 is not mirrored/);
  });

  it("(h) marker OQ-1 where Open questions only names OQ-12 -> mirroring violation", () => {
    const text = spec({ body: [MARK(1)], open: ["- OQ-12 → AC-1 — other"] });
    const { violations } = checkSpec(text, "x.md");
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /OQ-1 is not mirrored/);
  });

  it("(i) marker without an OQ id -> violation", () => {
    const text = spec({ body: ["- AC-1: [NEEDS CLARIFICATION: which one?]"] });
    const { violations } = checkSpec(text, "x.md");
    assert.ok(violations.some((v) => /marker without an OQ id/.test(v.message)));
  });

  it("(j) marker inside ``` and ~~~ fences is ignored", () => {
    const text = spec({
      status: "approved",
      body: ["```", MARK(1), "```", "", "~~~md", MARK(2), "~~~"],
    });
    const res = checkSpec(text, "x.md");
    assert.equal(res.markers.length, 0);
    assert.deepEqual(res.violations, []);
  });

  it("(k) marker inside inline backticks is counted", () => {
    const text = spec({ status: "approved", body: [`- AC-1: see \`${MARK(1)}\``], open: ["- OQ-1 → AC-1"] });
    const res = checkSpec(text, "x.md");
    assert.equal(res.markers.length, 1);
    assert.equal(res.violations.length, 1);
  });

  it("(l) no Status line, and `Status: aproved` -> violation naming the file", () => {
    const none = checkSpec("# Spec: x\n\nbody\n", "specs/SPEC-98-x.md");
    assert.equal(none.violations.length, 1);
    assert.equal(none.violations[0].file, "specs/SPEC-98-x.md");
    assert.match(none.violations[0].message, /missing or unknown Status/);

    const typo = checkSpec(spec({ status: "aproved" }), "specs/SPEC-97-y.md");
    assert.equal(typo.violations.length, 1);
    assert.equal(typo.violations[0].file, "specs/SPEC-97-y.md");
    assert.match(typo.violations[0].message, /aproved/);
  });
});

describe("CLI", () => {
  let tmp;
  const run = (...argv) => spawnSync(process.execPath, [SCRIPT, ...argv], { encoding: "utf8" });

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), "check-specs-"));
    writeFileSync(join(tmp, "SPEC-01-x.md"), spec());
    writeFileSync(join(tmp, "README.md"), `Describes the marker: ${MARK(1)}\n`);
  });
  after(() => rmSync(tmp, { recursive: true, force: true }));

  it("(m) clean spec + README holding a marker -> exit 0", () => {
    const r = run("--dir", tmp);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /check-specs: 1 spec\(s\), 0 marker\(s\), 0 violation\(s\)/);
  });

  it("(n) a nested sub/SPEC-02-y.md with a marker is ignored -> exit 0", () => {
    mkdirSync(join(tmp, "sub"), { recursive: true });
    writeFileSync(join(tmp, "sub", "SPEC-02-y.md"), spec({ status: "approved", body: [MARK(1)] }));
    const r = run("--dir", tmp);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it("(o) approved spec with a marker -> exit 1 and file:line in stdout", () => {
    const dir = mkdtempSync(join(tmpdir(), "check-specs-o-"));
    try {
      writeFileSync(
        join(dir, "SPEC-03-z.md"),
        spec({ status: "approved", body: [MARK(1)], open: ["- OQ-1 → AC-1 — q"] }),
      );
      const r = run("--dir", dir);
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /SPEC-03-z\.md:6: marker in a spec with Status: approved/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(p) --dir pointing at a missing path -> exit 2", () => {
    const r = run("--dir", join(tmp, "does-not-exist"));
    assert.equal(r.status, 2);
  });

  it("(q) no --dir (the real specs/) -> exit 0", () => {
    const r = run();
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
});
