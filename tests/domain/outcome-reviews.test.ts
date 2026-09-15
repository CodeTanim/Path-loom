import { describe, expect, it } from "vitest";

import {
  analyzeProject,
  getExplorationSummary,
  getOutcomeReview,
  getOutcomeReviewSummary,
  isPathloomDocument,
  OUTCOME_REVIEW_LIMIT,
  OUTCOME_REVIEW_NOTE_MAX_LENGTH,
  outcomeReviewKey,
  parsePathloomDocument,
  reconcileExploration,
  reconcileOutcomeReviews,
  recordExploredOutcome,
  setOutcomeReview,
  type OutcomeReview,
  type ProjectDocument,
} from "../../src/domain";

function projectFixture(): ProjectDocument {
  return {
    schemaVersion: 1,
    id: "review-project",
    name: "Payment review",
    entryNodeId: "checkout",
    nodes: [
      {
        id: "checkout", name: "Checkout", kind: "screen", position: { x: 0, y: 0 },
        initialStateId: "ready", states: [
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

function reviewFixture(overrides: Partial<OutcomeReview> = {}): OutcomeReview {
  return {
    interactionId: "pay", outcomeId: "paid", sourceNodeId: "checkout", sourceStateId: "ready",
    note: "Show the receipt number.", status: "needs-work", ...overrides,
  };
}

function reviewedFixture(overrides: Partial<OutcomeReview> = {}) {
  return setOutcomeReview(projectFixture(), reviewFixture(overrides));
}

function capacityFixture(count: number) {
  const project = projectFixture();
  const template = project.interactions[0].outcomes[0];
  project.interactions[0].outcomes = Array.from({ length: count }, (_, index) => ({
    ...template, id: `outcome-${index}`,
  }));
  return project;
}

describe("outcome review annotations", () => {
  it("leaves legacy projects untouched until the first flag", () => {
    const project = projectFixture();
    expect(getOutcomeReview(project, "pay", "paid")).toBeNull();
    expect(reconcileOutcomeReviews(project)).toBe(project);
    expect(getOutcomeReviewSummary(project)).toEqual({ items: [], open: 0, resolved: 0, total: 0 });
    expect(project.outcomeReviews).toBeUndefined();
  });

  it("adds a flag without mutating the document or annotation object", () => {
    const project = projectFixture();
    const review = Object.freeze(reviewFixture());
    Object.freeze(project);
    const next = setOutcomeReview(project, review);
    expect(project.outcomeReviews).toBeUndefined();
    expect(next.outcomeReviews).toEqual({ version: 1, items: [review] });
    expect(next.nodes).toBe(project.nodes);
    expect(next.interactions).toBe(project.interactions);
    expect(getOutcomeReview(next, "pay", "paid")).toEqual(review);
    expect(next.outcomeReviews!.items[0]).not.toBe(review);
  });

  it("updates one compound-key review instead of adding flags per source state", () => {
    const original = reviewedFixture();
    const next = setOutcomeReview(original, reviewFixture({ sourceStateId: "error", note: "Preserve billing details." }));
    expect(next.outcomeReviews!.items).toHaveLength(1);
    expect(getOutcomeReview(next, "pay", "paid")).toMatchObject({ sourceStateId: "error", note: "Preserve billing details." });
    expect(getOutcomeReview(original, "pay", "paid")!.note).toBe("Show the receipt number.");
  });

  it("resolves and reopens without clearing the saved note or source context", () => {
    const original = reviewedFixture({ sourceStateId: "error" });
    const review = getOutcomeReview(original, "pay", "paid")!;
    const resolved = setOutcomeReview(original, { ...review, status: "resolved" });
    expect(getOutcomeReviewSummary(resolved)).toMatchObject({ open: 0, resolved: 1, total: 1 });
    expect(getOutcomeReview(resolved, "pay", "paid")).toEqual({ ...review, status: "resolved" });
    const reopened = setOutcomeReview(resolved, { ...review, status: "needs-work" });
    expect(getOutcomeReviewSummary(reopened)).toMatchObject({ open: 1, resolved: 0, total: 1 });
  });

  it("returns the same document for identical updates and reconciliation", () => {
    const project = reviewedFixture();
    expect(setOutcomeReview(project, reviewFixture())).toBe(project);
    expect(reconcileOutcomeReviews(project)).toBe(project);
    expect(reconcileOutcomeReviews(project, [reviewFixture()])).toBe(project);
  });

  it("bounds note length, permits an empty note, and strips derived UI fields", () => {
    const review = { ...reviewFixture(), note: "x".repeat(OUTCOME_REVIEW_NOTE_MAX_LENGTH + 100), canRevisit: true, key: "ui-only" };
    const project = setOutcomeReview(projectFixture(), review);
    expect(getOutcomeReview(project, "pay", "paid")!.note).toHaveLength(OUTCOME_REVIEW_NOTE_MAX_LENGTH);
    expect(getOutcomeReview(project, "pay", "paid")).not.toHaveProperty("canRevisit");
    expect(getOutcomeReview(project, "pay", "paid")).not.toHaveProperty("key");
    const empty = setOutcomeReview(project, reviewFixture({ note: "" }));
    expect(getOutcomeReview(empty, "pay", "paid")!.note).toBe("");
    expect(isPathloomDocument(empty)).toBe(true);
  });

  it("rejects flagging deleted outcomes, missing actions, and another action's outcome", () => {
    const project = projectFixture();
    project.interactions.push({ ...project.interactions[0], id: "other-action", outcomes: [] });
    for (const review of [
      reviewFixture({ interactionId: "missing" }),
      reviewFixture({ outcomeId: "missing" }),
      reviewFixture({ interactionId: "other-action" }),
    ]) expect(setOutcomeReview(project, review)).toBe(project);
  });

  it("enforces the item limit while allowing edits and resolutions at capacity", () => {
    const project = capacityFixture(OUTCOME_REVIEW_LIMIT + 1);
    project.outcomeReviews = { version: 1, items: Array.from({ length: OUTCOME_REVIEW_LIMIT }, (_, index) => reviewFixture({ outcomeId: `outcome-${index}` })) };
    expect(setOutcomeReview(project, reviewFixture({ outcomeId: `outcome-${OUTCOME_REVIEW_LIMIT}` }))).toBe(project);
    const next = setOutcomeReview(project, reviewFixture({ outcomeId: "outcome-0", status: "resolved", note: "Fixed." }));
    expect(next.outcomeReviews!.items).toHaveLength(OUTCOME_REVIEW_LIMIT);
    expect(getOutcomeReview(next, "pay", "outcome-0")).toMatchObject({ status: "resolved", note: "Fixed." });
    expect(isPathloomDocument(next)).toBe(true);
  });

  it("frees capacity occupied by reviews whose outcomes were deleted", () => {
    const project = capacityFixture(OUTCOME_REVIEW_LIMIT + 1);
    project.outcomeReviews = { version: 1, items: Array.from({ length: OUTCOME_REVIEW_LIMIT }, (_, index) => reviewFixture({ outcomeId: `outcome-${index}` })) };
    project.interactions[0].outcomes.shift();
    const next = setOutcomeReview(project, reviewFixture({ outcomeId: `outcome-${OUTCOME_REVIEW_LIMIT}` }));
    expect(next.outcomeReviews!.items).toHaveLength(OUTCOME_REVIEW_LIMIT);
    expect(getOutcomeReview(next, "pay", `outcome-${OUTCOME_REVIEW_LIMIT}`)).not.toBeNull();
  });

  it("does not change exploration, fingerprints, or structural analysis when flagging or resolving", () => {
    const project = recordExploredOutcome(projectFixture(), "pay", "paid", "ready");
    const exploration = getExplorationSummary(project);
    const analysis = analyzeProject(project);
    const flagged = setOutcomeReview(project, reviewFixture());
    const resolved = setOutcomeReview(flagged, reviewFixture({ status: "resolved" }));
    for (const next of [flagged, resolved]) {
      expect(next.exploration).toBe(project.exploration);
      expect(getExplorationSummary(next)).toEqual(exploration);
      expect(analyzeProject(next)).toEqual(analysis);
      expect(reconcileExploration(next)).toBe(next);
    }
  });

  it("encodes compound keys without delimiter or punctuation collisions", () => {
    expect(outcomeReviewKey("a:b", "c")).not.toBe(outcomeReviewKey("a", "b:c"));
    expect(outcomeReviewKey('a\"', "b\\c")).toBe(JSON.stringify(['a\"', "b\\c"]));
  });
});

describe("review reconciliation and design history", () => {
  it("keeps flags through semantic, state, layout, and destination changes", () => {
    const project = reviewedFixture();
    const changed = structuredClone(project);
    changed.nodes[0].name = "Changed name";
    changed.nodes[0].position = { x: 100, y: -70 };
    changed.nodes[0].states[0].description = "New screen copy";
    changed.interactions[0].name = "New action";
    changed.interactions[0].outcomes[0].name = "New outcome";
    changed.interactions[0].outcomes[0].target = null;
    expect(reconcileOutcomeReviews(changed)).toBe(changed);
    expect(changed.outcomeReviews).toEqual(project.outcomeReviews);
    expect(getOutcomeReviewSummary(changed).items[0]).toMatchObject({ sourceName: "Changed name", interactionName: "New action", outcomeName: "New outcome", status: "needs-work" });
  });

  it("prunes deleted action/outcome owners only, not missing source references", () => {
    const project = setOutcomeReview(reviewedFixture(), reviewFixture({ outcomeId: "declined" }));
    project.interactions[0].outcomes.shift();
    expect(getOutcomeReview(project, "pay", "paid")).toBeNull();
    expect(getOutcomeReviewSummary(project).total).toBe(1);
    const pruned = reconcileOutcomeReviews(project);
    expect(pruned.outcomeReviews!.items.map((item) => item.outcomeId)).toEqual(["declined"]);
    pruned.nodes = [];
    expect(reconcileOutcomeReviews(pruned)).toBe(pruned);
    pruned.interactions = [];
    expect(reconcileOutcomeReviews(pruned).outcomeReviews!.items).toEqual([]);
  });

  it("does not transfer a review when the outcome is moved to a different owner", () => {
    const project = reviewedFixture();
    const outcome = project.interactions[0].outcomes.shift()!;
    project.interactions.push({ ...project.interactions[0], id: "other-action", outcomes: [outcome] });
    expect(reconcileOutcomeReviews(project).outcomeReviews!.items).toEqual([]);
  });

  it("preserves current notes, resolutions, and new flags when restoring an earlier snapshot", () => {
    const snapshot = reviewedFixture();
    const current = setOutcomeReview(
      setOutcomeReview(snapshot, reviewFixture({ note: "Fixed receipt number.", status: "resolved" })),
      reviewFixture({ outcomeId: "declined", note: "Retry wording unclear." }),
    );
    const restored = reconcileOutcomeReviews(snapshot, current.outcomeReviews!.items);
    expect(restored.outcomeReviews).toEqual(current.outcomeReviews);
    expect(snapshot.outcomeReviews!.items[0].status).toBe("needs-work");
    expect(reconcileOutcomeReviews(projectFixture(), current.outcomeReviews!.items).outcomeReviews).toEqual(current.outcomeReviews);
  });

  it("restores a deleted outcome's snapshot review without discarding newer independent reviews", () => {
    const snapshot = reviewedFixture();
    const current = structuredClone(snapshot);
    current.interactions[0].outcomes.shift();
    const afterDelete = setOutcomeReview(reconcileOutcomeReviews(current), reviewFixture({ outcomeId: "declined", note: "Keep my new flag." }));
    const restored = reconcileOutcomeReviews(snapshot, afterDelete.outcomeReviews!.items);
    expect(restored.outcomeReviews!.items).toEqual([
      reviewFixture(), reviewFixture({ outcomeId: "declined", note: "Keep my new flag." }),
    ]);
    expect(reconcileOutcomeReviews(afterDelete, restored.outcomeReviews!.items).outcomeReviews).toEqual(afterDelete.outcomeReviews);
  });

  it("prioritizes current records when combining full disjoint history snapshots", () => {
    const project = capacityFixture(OUTCOME_REVIEW_LIMIT * 2);
    project.outcomeReviews = { version: 1, items: Array.from({ length: OUTCOME_REVIEW_LIMIT }, (_, index) => reviewFixture({ outcomeId: `outcome-${index}` })) };
    const preferred = Array.from({ length: OUTCOME_REVIEW_LIMIT }, (_, index) => reviewFixture({ outcomeId: `outcome-${index + OUTCOME_REVIEW_LIMIT}`, status: "resolved" }));
    const restored = reconcileOutcomeReviews(project, preferred);
    expect(restored.outcomeReviews!.items).toEqual(preferred);
    expect(isPathloomDocument(restored)).toBe(true);
  });

  it("ignores deleted preferred records without materializing empty legacy metadata", () => {
    const project = projectFixture();
    expect(reconcileOutcomeReviews(project, [reviewFixture({ outcomeId: "deleted" })])).toBe(project);
  });
});

describe("review revisit eligibility", () => {
  it("revisits the recorded reachable state, including a non-initial state", () => {
    const project = reviewedFixture({ sourceStateId: "error" });
    expect(getOutcomeReviewSummary(project, analyzeProject(project))).toMatchObject({
      open: 1, resolved: 0, total: 1,
      items: [{ key: outcomeReviewKey("pay", "paid"), sourceName: "Checkout", sourceStateName: "Error", interactionName: "Pay", outcomeName: "Paid", canRevisit: true }],
    });
    expect(getOutcomeReviewSummary(project).items[0]).not.toHaveProperty("reason");
  });

  it.each([
    ["an unresolved destination", null],
    ["a deleted destination", { nodeId: "missing", stateId: null }],
    ["a missing destination state", { nodeId: "done", stateId: "missing" }],
  ] as const)("allows revisiting %s for inspection", (_label, target) => {
    const project = reviewedFixture();
    project.interactions[0].outcomes[0].target = target;
    expect(getOutcomeReviewSummary(project).items[0].canRevisit).toBe(true);
  });

  const unavailable: [string, (project: ProjectDocument) => void, string][] = [
    ["moved source", (project) => { project.interactions[0].sourceNodeId = "done"; }, "different screen"],
    ["missing source", (project) => { project.nodes.shift(); }, "source screen is missing"],
    ["null recorded state", (project) => { project.outcomeReviews!.items[0].sourceStateId = null; }, "No source state was recorded"],
    ["missing recorded state", (project) => { project.nodes[0].states.shift(); }, "source state is missing"],
    ["terminal source", (project) => { project.nodes[0].kind = "terminal"; }, "ends the flow"],
    ["inapplicable source state", (project) => { project.interactions[0].sourceStateId = "error"; }, "no longer available"],
    ["unreachable recorded state", (project) => { project.outcomeReviews!.items[0].sourceStateId = "offline"; }, "cannot be reached"],
    ["unreachable screen", (project) => { project.entryNodeId = "done"; }, "cannot be reached"],
  ];
  it.each(unavailable)("retains %s flags but disables revisiting with an explanation", (_label, mutate, reason) => {
    const project = reviewedFixture();
    mutate(project);
    expect(reconcileOutcomeReviews(project)).toBe(project);
    const summary = getOutcomeReviewSummary(project);
    expect(summary).toMatchObject({ open: 1, total: 1, items: [{ canRevisit: false }] });
    expect(summary.items[0].reason).toContain(reason);
  });

  it("never substitutes an initial state after the recorded source state changes", () => {
    const project = reviewedFixture({ sourceStateId: "error" });
    project.nodes[0].states = project.nodes[0].states.filter((state) => state.id !== "error");
    const item = getOutcomeReviewSummary(project).items[0];
    expect(item).toMatchObject({ sourceStateId: "error", sourceStateName: "Missing state", canRevisit: false });
  });

  it("supports revisiting a resolved review for a fresh look without reopening it", () => {
    const project = reviewedFixture({ status: "resolved" });
    expect(getOutcomeReviewSummary(project)).toMatchObject({ open: 0, resolved: 1, items: [{ canRevisit: true, status: "resolved" }] });
    expect(getOutcomeReview(project, "pay", "paid")!.status).toBe("resolved");
  });
});

describe("outcome review persistence boundary", () => {
  it("accepts legacy, empty, null-state, and stale-but-structural records", () => {
    const project = projectFixture();
    expect(isPathloomDocument(project)).toBe(true);
    for (const items of [[], [reviewFixture({ sourceStateId: null })], [reviewFixture({ interactionId: "deleted", sourceNodeId: "deleted", sourceStateId: "deleted" })]]) {
      const document = { ...project, outcomeReviews: { version: 1, items } };
      expect(isPathloomDocument(document)).toBe(true);
      expect(parsePathloomDocument(JSON.stringify(document))).toEqual(document);
    }
  });

  const invalid = [
    null, [], {}, { version: 2, items: [] }, { version: 1 }, { version: 1, items: null }, { version: 1, items: {} },
    { version: 1, items: [null] }, { version: 1, items: [{}] },
    ...[
      { interactionId: "" }, { interactionId: " " }, { interactionId: 12 },
      { outcomeId: "" }, { outcomeId: null },
      { sourceNodeId: " " }, { sourceNodeId: null },
      { sourceStateId: "" }, { sourceStateId: 12 }, { sourceStateId: undefined },
      { note: null }, { note: 2 }, { note: undefined }, { note: "x".repeat(OUTCOME_REVIEW_NOTE_MAX_LENGTH + 1) },
      { status: "approved" }, { status: "" }, { status: undefined },
    ].map((overrides) => ({ version: 1, items: [{ ...reviewFixture(), ...overrides }] })),
  ];
  it.each(invalid)("rejects malformed outcome review metadata %#", (outcomeReviews) => {
    const document = { ...projectFixture(), outcomeReviews };
    expect(isPathloomDocument(document)).toBe(false);
    expect(parsePathloomDocument(JSON.stringify(document))).toBeNull();
  });

  it("rejects duplicate outcome reviews even when context and status differ", () => {
    expect(isPathloomDocument({ ...projectFixture(), outcomeReviews: { version: 1, items: [reviewFixture(), reviewFixture({ sourceStateId: "error", status: "resolved" })] } })).toBe(false);
  });

  it("enforces inclusive note and review limits", () => {
    const project = projectFixture();
    const items = Array.from({ length: OUTCOME_REVIEW_LIMIT }, (_, index) => reviewFixture({ outcomeId: `outcome-${index}` }));
    items[0].note = "x".repeat(OUTCOME_REVIEW_NOTE_MAX_LENGTH);
    expect(isPathloomDocument({ ...project, outcomeReviews: { version: 1, items } })).toBe(true);
    expect(isPathloomDocument({ ...project, outcomeReviews: { version: 1, items: [...items, reviewFixture({ outcomeId: "overflow" })] } })).toBe(false);
  });
});
