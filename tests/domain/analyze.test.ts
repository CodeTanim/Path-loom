import { describe, expect, it } from "vitest";

import {
  analyzeProject,
  checkoutProject,
  type ProjectDocument,
} from "../../src/domain";

function createProject(
  overrides: Partial<ProjectDocument> = {},
): ProjectDocument {
  return {
    schemaVersion: 1,
    id: "project",
    name: "Test project",
    entryNodeId: "start",
    nodes: [
      {
        id: "start",
        name: "Start",
        kind: "screen",
        position: { x: 0, y: 0 },
        initialStateId: "start-idle",
        states: [{ id: "start-idle", name: "Idle", kind: "idle" }],
      },
      {
        id: "done",
        name: "Done",
        kind: "terminal",
        position: { x: 300, y: 0 },
        initialStateId: "done-success",
        states: [{ id: "done-success", name: "Success", kind: "success" }],
      },
    ],
    interactions: [
      {
        id: "continue",
        name: "Continue",
        kind: "navigation",
        trigger: "click",
        sourceNodeId: "start",
        sourceStateId: "start-idle",
        outcomes: [
          {
            id: "continued",
            name: "Continued",
            kind: "success",
            target: { nodeId: "done", stateId: "done-success" },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("analyzeProject", () => {
  it("finds reachable and unreachable nodes in document order", () => {
    const project = createProject();
    project.nodes.push({
      id: "orphan",
      name: "Orphan",
      kind: "terminal",
      position: { x: 600, y: 0 },
      initialStateId: null,
      states: [],
    });

    const report = analyzeProject(project);

    expect(report.reachableStatePairs).toEqual([
      { nodeId: "start", stateId: "start-idle" },
      { nodeId: "done", stateId: "done-success" },
    ]);
    expect(report.reachableNodeIds).toEqual(["start", "done"]);
    expect(report.unreachableNodeIds).toEqual(["orphan"]);
    expect(report.summary.unreachableNodes).toBe(1);
  });

  it("marks reachable non-terminal nodes without a valid exit as dead ends", () => {
    const project = createProject({ interactions: [] });

    const report = analyzeProject(project);

    expect(report.deadEndNodeIds).toEqual(["start"]);
    expect(report.unreachableNodeIds).toEqual(["done"]);
  });

  it("reports interactions that cannot continue because they have no outcomes", () => {
    const project = createProject();
    project.interactions[0].outcomes = [];

    const report = analyzeProject(project);

    expect(report.missingOutcomeInteractionIds).toEqual(["continue"]);
    expect(report.issues).toContainEqual({
      type: "missing-outcome",
      severity: "warning",
      interactionId: "continue",
      message: "Interaction continue does not define any outcomes.",
    });
    expect(report.summary.missingOutcomes).toBe(1);
    expect(report.deadEndStatePairs).toEqual([
      { nodeId: "start", stateId: "start-idle" },
    ]);
  });

  it("separates unresolved outcomes from dangling node and state references", () => {
    const project = createProject({
      interactions: [
        {
          id: "branch",
          name: "Branch",
          kind: "navigation",
          trigger: "click",
          sourceNodeId: "start",
          sourceStateId: "missing-source-state",
          outcomes: [
            {
              id: "unfinished",
              name: "Unfinished",
              kind: "alternate",
              target: null,
            },
            {
              id: "missing-node",
              name: "Missing node",
              kind: "failure",
              target: { nodeId: "nowhere", stateId: null },
            },
            {
              id: "missing-state",
              name: "Missing state",
              kind: "success",
              target: { nodeId: "done", stateId: "not-a-state" },
            },
          ],
        },
      ],
    });

    const report = analyzeProject(project);

    expect(report.unresolvedBranches).toEqual([
      {
        interactionId: "branch",
        outcomeId: "unfinished",
        sourceNodeId: "start",
      },
    ]);
    expect(report.brokenBranches.map((branch) => branch.reason)).toEqual([
      "missing-source-state",
      "missing-target-node",
      "missing-target-state",
    ]);
    expect(report.summary.errors).toBe(3);
  });

  it("applies built-in and explicit UI state coverage rules", () => {
    const project = createProject({
      nodes: [
        {
          id: "start",
          name: "Start",
          kind: "screen",
          position: { x: 0, y: 0 },
          initialStateId: null,
          requiredStateKinds: ["empty"],
          states: [],
        },
        {
          id: "done",
          name: "Done",
          kind: "terminal",
          position: { x: 300, y: 0 },
          initialStateId: "done-idle",
          states: [{ id: "done-idle", name: "Idle", kind: "idle" }],
        },
      ],
      interactions: [
        {
          id: "load",
          name: "Load",
          kind: "async",
          trigger: "submit",
          sourceNodeId: "start",
          sourceStateId: null,
          outcomes: [
            {
              id: "loaded",
              name: "Loaded",
              kind: "success",
              target: { nodeId: "done", stateId: null },
            },
          ],
        },
      ],
    });

    const report = analyzeProject(project);

    expect(
      report.missingStates.map(({ nodeId, stateKind, rule }) => ({
        nodeId,
        stateKind,
        rule,
      })),
    ).toEqual([
      { nodeId: "start", stateKind: "idle", rule: "screen-idle" },
      { nodeId: "start", stateKind: "empty", rule: "node-requirement" },
      { nodeId: "start", stateKind: "loading", rule: "async-loading" },
      { nodeId: "done", stateKind: "success", rule: "outcome-target" },
    ]);
  });

  it("does not traverse an interaction scoped to an unreachable state", () => {
    const project = createProject();
    project.nodes[0].states.push({
      id: "start-error",
      name: "Error",
      kind: "error",
    });
    project.interactions[0].sourceStateId = "start-error";

    const report = analyzeProject(project);

    expect(report.reachableStatePairs).toEqual([
      { nodeId: "start", stateId: "start-idle" },
    ]);
    expect(report.unreachableNodeIds).toEqual(["done"]);
    expect(report.deadEndStatePairs).toEqual([
      { nodeId: "start", stateId: "start-idle" },
    ]);
    expect(report.deadEndNodeIds).toEqual(["start"]);
  });

  it("resolves an implicit target through its valid initial state", () => {
    const project = createProject();
    project.interactions[0].outcomes[0].target = {
      nodeId: "done",
      stateId: null,
    };

    const report = analyzeProject(project);

    expect(report.reachableStatePairs).toEqual([
      { nodeId: "start", stateId: "start-idle" },
      { nodeId: "done", stateId: "done-success" },
    ]);
    expect(report.brokenBranches).toEqual([]);
  });

  it.each([null, "missing-initial-state"])(
    "rejects an implicit target when the target initial state is invalid (%s)",
    (initialStateId) => {
      const project = createProject();
      project.nodes[1].initialStateId = initialStateId;
      project.interactions[0].outcomes[0].target = {
        nodeId: "done",
        stateId: null,
      };

      const report = analyzeProject(project);

      expect(report.reachableStatePairs).toEqual([
        { nodeId: "start", stateId: "start-idle" },
      ]);
      expect(report.unreachableNodeIds).toEqual(["done"]);
      expect(report.brokenBranches).toContainEqual({
        interactionId: "continue",
        outcomeId: "continued",
        reason: "missing-target-initial-state",
        referencedId: "done",
      });
    },
  );

  it.each([
    [null, null],
    ["missing-start-state", "missing-start-state"],
  ])(
    "rejects an entry node without a valid initial state (%s)",
    (initialStateId, expectedStateId) => {
      const project = createProject();
      project.nodes[0].initialStateId = initialStateId;

      const report = analyzeProject(project);

      expect(report.reachableStatePairs).toEqual([]);
      expect(report.reachableNodeIds).toEqual([]);
      expect(report.issues[0]).toMatchObject({
        type: "missing-entry-node",
        severity: "error",
        nodeId: "start",
        reason: "missing-entry-initial-state",
        stateId: expectedStateId,
      });
    },
  );

  it("checks the exact target state's kind for outcome coverage", () => {
    const project = createProject();
    project.nodes[1].states.unshift({
      id: "done-idle",
      name: "Idle",
      kind: "idle",
    });
    project.nodes[1].initialStateId = "done-idle";
    project.interactions[0].outcomes[0].target = {
      nodeId: "done",
      stateId: "done-idle",
    };

    const report = analyzeProject(project);

    expect(report.missingStates).not.toContainEqual(
      expect.objectContaining({
        nodeId: "done",
        stateKind: "success",
      }),
    );
    expect(report.outcomeStateKindMismatches).toEqual([
      {
        interactionId: "continue",
        outcomeId: "continued",
        outcomeKind: "success",
        targetNodeId: "done",
        targetStateId: "done-idle",
        expectedStateKind: "success",
        actualStateKind: "idle",
      },
    ]);
    expect(report.issues).toContainEqual({
      type: "outcome-state-kind-mismatch",
      severity: "warning",
      mismatch: report.outcomeStateKindMismatches[0],
      message:
        "Outcome continued is success but targets done-idle (idle); expected a success state.",
    });
  });

  it("reports only the reachable state without an exit as a dead end", () => {
    const project = createProject();
    project.nodes.splice(1, 0, {
      id: "review",
      name: "Review",
      kind: "screen",
      position: { x: 150, y: 0 },
      initialStateId: "review-idle",
      states: [
        { id: "review-idle", name: "Idle", kind: "idle" },
        { id: "review-error", name: "Error", kind: "error" },
      ],
    });
    project.interactions = [
      {
        id: "open-review",
        name: "Open review",
        kind: "navigation",
        trigger: "click",
        sourceNodeId: "start",
        sourceStateId: "start-idle",
        outcomes: [
          {
            id: "review-idle-outcome",
            name: "Review",
            kind: "alternate",
            target: { nodeId: "review", stateId: "review-idle" },
          },
          {
            id: "review-error-outcome",
            name: "Review error",
            kind: "alternate",
            target: { nodeId: "review", stateId: "review-error" },
          },
        ],
      },
      {
        id: "finish-review",
        name: "Finish review",
        kind: "navigation",
        trigger: "click",
        sourceNodeId: "review",
        sourceStateId: "review-idle",
        outcomes: [
          {
            id: "reviewed",
            name: "Reviewed",
            kind: "alternate",
            target: { nodeId: "done", stateId: "done-success" },
          },
        ],
      },
    ];

    const report = analyzeProject(project);

    expect(report.deadEndStatePairs).toEqual([
      { nodeId: "review", stateId: "review-error" },
    ]);
    expect(report.deadEndNodeIds).toEqual(["review"]);
    expect(report.summary.deadEnds).toBe(1);
  });

  it("does not traverse interactions exposed by terminal nodes", () => {
    const project = createProject();
    project.nodes[0].kind = "terminal";

    const report = analyzeProject(project);

    expect(report.reachableNodeIds).toEqual(["start"]);
    expect(report.unreachableNodeIds).toEqual(["done"]);
    expect(report.deadEndStatePairs).toEqual([]);
    expect(report.brokenBranches[0]).toMatchObject({
      interactionId: "continue",
      reason: "terminal-source-node",
      referencedId: "start",
    });
  });

  it("reports a missing entry point and keeps analysis deterministic", () => {
    const report = analyzeProject(createProject({ entryNodeId: "missing" }));

    expect(report.reachableNodeIds).toEqual([]);
    expect(report.unreachableNodeIds).toEqual(["start", "done"]);
    expect(report.issues[0]).toMatchObject({
      type: "missing-entry-node",
      severity: "error",
      nodeId: "missing",
    });
  });

  it("analyzes the serializable checkout sample", () => {
    const clone = JSON.parse(JSON.stringify(checkoutProject)) as ProjectDocument;
    const report = analyzeProject(clone);

    expect(clone).toEqual(checkoutProject);
    expect(report.reachableNodeIds).toEqual([
      "checkout",
      "confirmation",
      "declined",
      "retry",
      "sign-in",
    ]);
    expect(report.unreachableNodeIds).toEqual(["legacy-receipt"]);
    expect(report.unresolvedBranches).toHaveLength(1);
    expect(report.missingStates).toEqual([
      {
        nodeId: "retry",
        stateKind: "empty",
        rule: "node-requirement",
        reason: "The node explicitly requires the empty state.",
      },
    ]);
    expect(report.brokenBranches).toEqual([]);
    expect(report.deadEndStatePairs).toEqual([]);
    expect(
      checkoutProject.interactions.find(
        (interaction) => interaction.id === "reauthenticate",
      )?.sourceStateId,
    ).toBe("sign-in-unauthorized");
  });
});
