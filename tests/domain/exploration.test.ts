import { describe, expect, it } from "vitest";

import {
  analyzeProject,
  EXPLORATION_FINGERPRINT_MAX_LENGTH,
  EXPLORATION_VISIT_LIMIT,
  getExplorationSummary,
  getNextUnexploredCheck,
  isPathloomDocument,
  parsePathloomDocument,
  reconcileExploration,
  recordExploredOutcome,
  type ExplorationVisit,
  type ProjectDocument,
} from "../../src/domain";

function projectFixture(): ProjectDocument {
  return {
    schemaVersion: 1,
    id: "review-flow",
    name: "Review flow",
    entryNodeId: "checkout",
    nodes: [
      {
        id: "checkout", name: "Checkout", kind: "screen", position: { x: 0, y: 0 },
        initialStateId: "ready",
        states: [
          { id: "ready", name: "Ready", kind: "idle" },
          { id: "error", name: "Error", kind: "error" },
          { id: "offline", name: "Offline", kind: "offline" },
        ],
      },
      {
        id: "done", name: "Confirmation", kind: "terminal", position: { x: 500, y: 0 },
        initialStateId: "success", states: [{ id: "success", name: "Success", kind: "success" }],
      },
    ],
    interactions: [{
      id: "pay", name: "Pay", kind: "async", trigger: "submit",
      sourceNodeId: "checkout", sourceStateId: null,
      outcomes: [
        { id: "paid", name: "Paid", kind: "success", target: { nodeId: "done", stateId: null } },
        { id: "declined", name: "Declined", kind: "failure", target: { nodeId: "checkout", stateId: "error" } },
      ],
    }],
  };
}

function explorePaid(project = projectFixture(), stateId = "ready") {
  return recordExploredOutcome(project, "pay", "paid", stateId);
}

function exploredKeys(project: ProjectDocument) {
  return getExplorationSummary(project).checks
    .filter((check) => check.status === "explored")
    .map((check) => [check.interactionId, check.outcomeId, check.sourceStateId]);
}

describe("outcome exploration", () => {
  it("creates separate checks for each reachable source state, not every supported state", () => {
    const project = projectFixture();
    const report = getExplorationSummary(project, analyzeProject(project));
    expect(report).toMatchObject({ total: 4, explored: 0, unexplored: 4, needsFix: 0, unreachable: 0 });
    expect(report.checks.map((check) => [check.outcomeId, check.sourceStateId])).toEqual([
      ["paid", "ready"], ["paid", "error"], ["declined", "ready"], ["declined", "error"],
    ]);
    expect(getNextUnexploredCheck(report)).toMatchObject({ outcomeId: "paid", sourceStateId: "ready" });
  });

  it("records only the context that was followed and deduplicates repeat visits", () => {
    const original = projectFixture();
    const first = explorePaid(original);
    const repeated = explorePaid(first);
    expect(repeated).toBe(first);
    expect(original.exploration).toBeUndefined();
    expect(exploredKeys(first)).toEqual([["pay", "paid", "ready"]]);
    expect(first.exploration?.visits).toHaveLength(1);
    expect(getExplorationSummary(first).explored).toBe(1);
    expect(getNextUnexploredCheck(getExplorationSummary(first))).toMatchObject({ outcomeId: "paid", sourceStateId: "error" });
  });

  it("records any valid chosen outcome, not only an outcome named success", () => {
    const project = recordExploredOutcome(projectFixture(), "pay", "declined", "ready");
    expect(exploredKeys(project)).toEqual([["pay", "declined", "ready"]]);
  });

  it("does not record null, missing, inapplicable, or unreachable source states", () => {
    const project = projectFixture();
    for (const stateId of [null, "missing", "offline"]) {
      expect(recordExploredOutcome(project, "pay", "paid", stateId)).toBe(project);
    }
    project.interactions[0].sourceStateId = "ready";
    expect(recordExploredOutcome(project, "pay", "paid", "error")).toBe(project);
    expect(recordExploredOutcome(project, "missing", "paid", "ready")).toBe(project);
    expect(recordExploredOutcome(project, "pay", "missing", "ready")).toBe(project);
    expect(getExplorationSummary(project).total).toBe(2);
  });

  it.each([
    ["no destination", null],
    ["missing destination", { nodeId: "missing", stateId: null }],
    ["missing destination state", { nodeId: "done", stateId: "missing" }],
  ] as const)("does not count a failed transition with %s", (_label, target) => {
    const project = projectFixture();
    project.interactions[0].outcomes[0].target = target;
    const summary = getExplorationSummary(project);
    expect(summary.needsFix).toBe(2);
    expect(summary.checks.filter((check) => check.outcomeId === "paid").every((check) => check.reason && check.fingerprint === null)).toBe(true);
    expect(explorePaid(project)).toBe(project);
  });

  it("requires a valid initial target state only when the outcome resolves through it", () => {
    const project = projectFixture();
    project.nodes[1].initialStateId = "missing";
    expect(getExplorationSummary(project).needsFix).toBe(2);
    project.interactions[0].outcomes[0].target!.stateId = "success";
    expect(getExplorationSummary(project).needsFix).toBe(0);
    expect(getExplorationSummary(explorePaid(project)).explored).toBe(1);
  });

  it.each(["missing-node", "missing-state", "terminal", "no-states"])("keeps invalid %s source outcomes visible as needs-fix", (fault) => {
    const project = projectFixture();
    if (fault === "missing-node") project.interactions[0].sourceNodeId = "missing";
    if (fault === "missing-state") project.interactions[0].sourceStateId = "missing";
    if (fault === "terminal") project.nodes[0].kind = "terminal";
    if (fault === "no-states") project.nodes[0].states = [];
    const report = getExplorationSummary(project);
    expect(report).toMatchObject({ total: 2, needsFix: 2, explored: 0, unexplored: 0 });
    expect(explorePaid(project)).toBe(project);
  });

  it("retains disconnected action outcomes without pretending their source states were reached", () => {
    const project = projectFixture();
    project.entryNodeId = "done";
    const summary = getExplorationSummary(project);
    expect(summary).toMatchObject({ total: 2, unreachable: 2, explored: 0, unexplored: 0, needsFix: 0 });
    expect(summary.checks[0]).toMatchObject({ sourceStateId: null, fingerprint: null });
    expect(getNextUnexploredCheck(summary)).toBeNull();
    expect(explorePaid(project)).toBe(project);
  });

  it("tracks arrival at a valid dead end while structural analysis still flags it", () => {
    const project = projectFixture();
    project.nodes[1].kind = "screen";
    const explored = explorePaid(project);
    expect(getExplorationSummary(explored).explored).toBe(1);
    expect(analyzeProject(explored).deadEndNodeIds).toContain("done");
  });

  it("handles graph cycles and completion without counting restart as a fresh check", () => {
    let project = projectFixture();
    const initial = getExplorationSummary(project);
    for (const check of initial.checks) {
      project = recordExploredOutcome(project, check.interactionId, check.outcomeId, check.sourceStateId);
    }
    const complete = getExplorationSummary(project);
    expect(complete).toMatchObject({ total: 4, explored: 4, unexplored: 0 });
    expect(getNextUnexploredCheck(complete)).toBeNull();
    expect(analyzeProject(project)).toEqual(analyzeProject(projectFixture()));
  });

  it("does not invent checks for an action without outcomes", () => {
    const project = projectFixture();
    project.interactions[0].outcomes = [];
    expect(getExplorationSummary(project)).toEqual({ checks: [], total: 0, explored: 0, unexplored: 0, needsFix: 0, unreachable: 0 });
    expect(analyzeProject(project).missingOutcomeInteractionIds).toEqual(["pay"]);
  });

  it("round-trips progress without a schema migration and leaves legacy documents untouched", () => {
    const project = projectFixture();
    expect(reconcileExploration(project)).toBe(project);
    const explored = explorePaid(project);
    const loaded = parsePathloomDocument(JSON.stringify(explored))!;
    expect(exploredKeys(loaded)).toEqual([["pay", "paid", "ready"]]);
    expect(isPathloomDocument(loaded)).toBe(true);
  });
});

describe("change-aware exploration", () => {
  it("retains progress through node, action, edge-route, note, and project presentation edits", () => {
    const project = structuredClone(explorePaid());
    project.name = "Renamed project";
    project.description = "Design review";
    project.nodes[0].position = { x: -100, y: 400 };
    project.nodes[1].size = { width: 1000, height: 700 };
    project.interactions[0].position = { x: 200, y: 300 };
    project.interactions[0].incomingRoute = { bendOffset: { x: 10, y: 90 } };
    project.interactions[0].outcomes[0].route = { bendOffset: { x: 70, y: -20 } };
    project.stickyNotes = [{ id: "note", text: "Review", position: { x: 0, y: 0 }, size: { width: 240, height: 200 } }];
    expect(exploredKeys(reconcileExploration(project))).toEqual([["pay", "paid", "ready"]]);
  });

  it("does not invalidate existing independent outcomes when a sibling is added or edited", () => {
    const project = structuredClone(explorePaid());
    project.interactions[0].outcomes.push({ id: "timeout", name: "Timeout", kind: "timeout", target: { nodeId: "checkout", stateId: "error" } });
    project.interactions[0].outcomes[1].name = "Card declined";
    expect(exploredKeys(project)).toEqual([["pay", "paid", "ready"]]);
  });

  it("ignores unrelated states but invalidates the specific source-state context that changed", () => {
    let project = explorePaid(explorePaid(), "error");
    project = structuredClone(project);
    project.nodes[0].states[2].description = "Wi-Fi unavailable";
    expect(getExplorationSummary(project).explored).toBe(2);
    project.nodes[0].states[1].description = "Ask for a different card";
    expect(exploredKeys(project)).toEqual([["pay", "paid", "ready"]]);
  });

  const semanticMutations: [string, (project: ProjectDocument) => void][] = [
    ["source screen name", (project) => { project.nodes[0].name = "Review order"; }],
    ["source screen description", (project) => { project.nodes[0].description = "Check billing address"; }],
    ["source state name", (project) => { project.nodes[0].states[0].name = "Waiting"; }],
    ["source state kind", (project) => { project.nodes[0].states[0].kind = "loading"; }],
    ["action name", (project) => { project.interactions[0].name = "Confirm payment"; }],
    ["action kind", (project) => { project.interactions[0].kind = "system"; }],
    ["action trigger", (project) => { project.interactions[0].trigger = "timer"; }],
    ["action scope", (project) => { project.interactions[0].sourceStateId = "ready"; }],
    ["outcome name", (project) => { project.interactions[0].outcomes[0].name = "Card charged"; }],
    ["outcome kind", (project) => { project.interactions[0].outcomes[0].kind = "alternate"; }],
    ["outcome description", (project) => { project.interactions[0].outcomes[0].description = "Card authorized"; }],
    ["outcome condition", (project) => { project.interactions[0].outcomes[0].condition = "Card valid"; }],
    ["outcome destination", (project) => { project.interactions[0].outcomes[0].target = { nodeId: "checkout", stateId: "error" }; }],
    ["target screen name", (project) => { project.nodes[1].name = "Receipt"; }],
    ["target screen kind", (project) => { project.nodes[1].kind = "screen"; }],
    ["target screen description", (project) => { project.nodes[1].description = "Show the receipt"; }],
    ["target state description", (project) => { project.nodes[1].states[0].description = "Email sent"; }],
    ["entry point", (project) => { project.entryNodeId = "done"; }],
    ["entry initial state", (project) => { project.nodes[0].initialStateId = "error"; }],
  ];
  it.each(semanticMutations)("requires another look after changing %s", (_label, mutate) => {
    const project = structuredClone(explorePaid());
    mutate(project);
    expect(getExplorationSummary(project).explored).toBe(0);
    expect(reconcileExploration(project).exploration?.visits).toEqual([]);
  });

  it("invalidates an inbound check when actions available in its destination state change", () => {
    const project = projectFixture();
    project.nodes[1].kind = "screen";
    const explored = structuredClone(explorePaid(project));
    explored.interactions.push({ id: "receipt", name: "Download receipt", kind: "local", trigger: "click", sourceNodeId: "done", sourceStateId: "success", outcomes: [] });
    expect(getExplorationSummary(explored).explored).toBe(0);
  });

  it("ignores an action added to a different destination state", () => {
    const project = projectFixture();
    project.nodes[1].kind = "screen";
    project.nodes[1].states.push({ id: "other", name: "Other", kind: "custom" });
    const explored = structuredClone(explorePaid(project));
    explored.interactions.push({ id: "other-action", name: "Other action", kind: "local", trigger: "click", sourceNodeId: "done", sourceStateId: "other", outcomes: [] });
    expect(getExplorationSummary(explored).explored).toBe(1);
  });

  it("invalidates only implicit destination checks when the destination's default state changes", () => {
    const project = projectFixture();
    project.nodes[1].states.push({ id: "other", name: "Other", kind: "custom" });
    project.interactions[0].outcomes.push({ id: "explicit", name: "Explicit", kind: "success", target: { nodeId: "done", stateId: "success" } });
    const explored = structuredClone(recordExploredOutcome(explorePaid(project), "pay", "explicit", "ready"));
    explored.nodes[1].initialStateId = "other";
    expect(exploredKeys(explored)).toEqual([["pay", "explicit", "ready"]]);
  });

  it("prunes progress for source states that become unreachable", () => {
    const project = structuredClone(explorePaid(explorePaid(), "error"));
    project.interactions[0].outcomes[1].target = { nodeId: "done", stateId: "success" };
    expect(exploredKeys(project)).toEqual([["pay", "paid", "ready"]]);
    expect(reconcileExploration(project).exploration?.visits).toHaveLength(1);
  });

  it("keeps fingerprints stable when collections or imported JSON property order change", () => {
    const original = recordExploredOutcome(explorePaid(), "pay", "declined", "ready");
    const project = structuredClone(original);
    project.nodes.reverse();
    project.nodes.forEach((node) => node.states.reverse());
    project.interactions.reverse();
    project.interactions.forEach((interaction) => interaction.outcomes.reverse());
    const reordered = JSON.parse(JSON.stringify(project, (_key, value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      return Object.fromEntries(Object.entries(value).reverse());
    })) as ProjectDocument;
    expect(getExplorationSummary(reordered).explored).toBe(2);
  });

  it("prunes deleted, duplicate, and stale visits while preserving valid independent progress", () => {
    let project = explorePaid();
    project = recordExploredOutcome(project, "pay", "declined", "ready");
    const visits = project.exploration!.visits;
    const stale = { ...visits[0], fingerprint: "stale-version" };
    const missing = { ...visits[0], outcomeId: "deleted" };
    project = structuredClone(project);
    project.interactions[0].outcomes[1].description = "Retry payment";
    project.exploration!.visits.push(visits[0], stale, missing);
    const reconciled = reconcileExploration(project);
    expect(reconciled.exploration?.visits).toEqual([visits[0]]);
    expect(reconcileExploration(reconciled)).toBe(reconciled);
  });

  it("merges progress learned after a history snapshot without restoring a mismatched fingerprint", () => {
    const original = explorePaid();
    const edited = structuredClone(original);
    edited.interactions[0].outcomes[0].name = "Payment processed";
    const learned = explorePaid(reconcileExploration(edited));
    expect(learned.exploration!.visits[0].fingerprint).not.toBe(original.exploration!.visits[0].fingerprint);
    expect(reconcileExploration(original, learned.exploration!.visits).exploration?.visits).toEqual(original.exploration!.visits);
    expect(reconcileExploration(edited, learned.exploration!.visits).exploration?.visits).toEqual(learned.exploration!.visits);
    const legacySnapshot = projectFixture();
    expect(exploredKeys(reconcileExploration(legacySnapshot, original.exploration!.visits))).toEqual([["pay", "paid", "ready"]]);
  });

  it("does not mutate frozen snapshots", () => {
    const project = projectFixture();
    Object.freeze(project);
    Object.freeze(project.nodes);
    Object.freeze(project.interactions);
    expect(() => explorePaid(project)).not.toThrow();
  });
});

describe("bounded exploration persistence", () => {
  function visitFixture(): ExplorationVisit {
    return { interactionId: "old-action", outcomeId: "old-outcome", sourceStateId: "old-state", fingerprint: "stale-but-structural" };
  }

  it("accepts absent, empty, and stale-but-well-formed progress", () => {
    const project = projectFixture();
    expect(isPathloomDocument(project)).toBe(true);
    expect(isPathloomDocument({ ...project, exploration: { version: 1, visits: [] } })).toBe(true);
    expect(isPathloomDocument({ ...project, exploration: { version: 1, visits: [visitFixture()] } })).toBe(true);
    expect(reconcileExploration({ ...project, exploration: { version: 1, visits: [visitFixture()] } }).exploration?.visits).toEqual([]);
  });

  it.each([
    null, [], {}, { version: 2, visits: [] }, { version: 1, visits: null },
    { version: 1, visits: [{}] },
    { version: 1, visits: [{ ...visitFixture(), interactionId: " " }] },
    { version: 1, visits: [{ ...visitFixture(), outcomeId: 42 }] },
    { version: 1, visits: [{ ...visitFixture(), sourceStateId: null }] },
    { version: 1, visits: [{ ...visitFixture(), fingerprint: "" }] },
    { version: 1, visits: [{ ...visitFixture(), fingerprint: "x".repeat(EXPLORATION_FINGERPRINT_MAX_LENGTH + 1) }] },
  ])("rejects invalid progress shape %#", (exploration) => {
    expect(isPathloomDocument({ ...projectFixture(), exploration })).toBe(false);
  });

  it("enforces inclusive visit and fingerprint length limits", () => {
    const visit = { ...visitFixture(), fingerprint: "x".repeat(EXPLORATION_FINGERPRINT_MAX_LENGTH) };
    const project = { ...projectFixture(), exploration: { version: 1, visits: [visit] } };
    expect(isPathloomDocument(project)).toBe(true);
    const visits = Array.from({ length: EXPLORATION_VISIT_LIMIT }, visitFixture);
    expect(isPathloomDocument({ ...projectFixture(), exploration: { version: 1, visits } })).toBe(true);
    expect(isPathloomDocument({ ...projectFixture(), exploration: { version: 1, visits: [...visits, visitFixture()] } })).toBe(false);
  });

  it("surfaces oversized branch text instead of writing a document it cannot load", () => {
    const project = projectFixture();
    project.interactions[0].outcomes[0].description = "x".repeat(EXPLORATION_FINGERPRINT_MAX_LENGTH);
    const check = getExplorationSummary(project).checks[0];
    expect(check).toMatchObject({ status: "needs-fix", fingerprint: null });
    expect(check.reason).toContain("too much text");
    expect(explorePaid(project)).toBe(project);
    expect(isPathloomDocument(project)).toBe(true);
  });

  it("shows explicit capacity findings for branches beyond the persisted visit limit", () => {
    const project = projectFixture();
    project.interactions[0].sourceStateId = "ready";
    project.interactions[0].outcomes = Array.from({ length: EXPLORATION_VISIT_LIMIT + 1 }, (_, index) => ({
      id: `outcome-${String(index).padStart(5, "0")}`, name: "Done", kind: "success", target: { nodeId: "done", stateId: null },
    }));
    const report = getExplorationSummary(project);
    expect(report).toMatchObject({ total: EXPLORATION_VISIT_LIMIT + 1, unexplored: EXPLORATION_VISIT_LIMIT, needsFix: 1 });
    expect(report.checks.at(-1)?.reason).toContain("10,000");
    project.interactions[0].outcomes.reverse();
    expect(getExplorationSummary(project).checks[0].status).toBe("needs-fix");
  });

  it("bounds large self-loop arrival signatures before copying them into every fingerprint", () => {
    const project = projectFixture();
    project.interactions[0].sourceStateId = "ready";
    project.interactions[0].outcomes = Array.from({ length: 500 }, (_, index) => ({
      id: `loop-${index}`, name: `Loop back through choice ${index}`, kind: "alternate", target: { nodeId: "checkout", stateId: "ready" },
    }));
    const summary = getExplorationSummary(project);
    expect(summary.needsFix).toBe(500);
    expect(summary.checks[0].reason).toContain("arrival choices");
    expect(summary.checks.every((check) => check.fingerprint === null)).toBe(true);
  });
});
