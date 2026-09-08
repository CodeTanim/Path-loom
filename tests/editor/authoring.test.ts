import { describe, expect, it } from "vitest";
import { analyzeProject, parsePathloomDocument } from "../../src/domain";
import { starterProject } from "../../src/domain/samples/starter";
import { freeScreenPosition, getStateRemovalReason, removeUnusedState } from "../../src/features/editor/authoring";

describe("simple editor defaults", () => {
  it("starts with a valid example and no unfinished paths", () => {
    expect(parsePathloomDocument(JSON.stringify(starterProject))).toEqual(starterProject);
    expect(analyzeProject(starterProject).issues).toEqual([]);
    expect(starterProject.interactions[0].outcomes.map((outcome) => outcome.kind)).toEqual(["success", "failure"]);
  });

  it("places new screens clear of existing screens and action cards", () => {
    const occupied = [{ position: { x: 40, y: 100 }, type: "screen" }, { position: { x: 40, y: 410 }, type: "interaction" }];
    const next = freeScreenPosition(occupied, { x: 40, y: 100 });
    expect(next).toEqual({ x: 40, y: 720 });
    expect(freeScreenPosition([...occupied, { position: next, type: "screen" }], next).y).toBe(1030);
  });

  it("removes unused states without changing referenced paths", () => {
    const next = removeUnusedState(starterProject, "payment-error", "payment-error-idle");
    expect(next.nodes.find((node) => node.id === "payment-error")?.states).toHaveLength(1);
    expect(next.interactions).toBe(starterProject.interactions);
    expect(analyzeProject(next).brokenBranches).toEqual([]);
    expect(starterProject.nodes.find((node) => node.id === "payment-error")?.states).toHaveLength(2);
  });

  it("protects the last state and states used by outcomes or actions", () => {
    expect(removeUnusedState(starterProject, "checkout", "checkout-idle")).toBe(starterProject);
    expect(removeUnusedState(starterProject, "payment-error", "payment-error-error")).toBe(starterProject);
    const scoped = structuredClone(starterProject);
    scoped.interactions[1].sourceStateId = "payment-error-idle";
    expect(removeUnusedState(scoped, "payment-error", "payment-error-idle")).toBe(scoped);
  });

  it("protects default destinations and the default start state", () => {
    const project = structuredClone(starterProject);
    project.interactions[0].outcomes[1].target!.stateId = null;
    expect(removeUnusedState(project, "payment-error", "payment-error-error")).toBe(project);
    project.nodes[0].states.push({ id: "checkout-loading", name: "Loading", kind: "loading" });
    project.interactions = [];
    expect(removeUnusedState(project, "checkout", "checkout-idle")).toBe(project);
  });

  it("explains why the last remaining state cannot be unchecked", () => {
    expect(getStateRemovalReason(starterProject, "confirmation", "confirmation-success"))
      .toBe("Keep at least one state on this screen.");
    expect(removeUnusedState(starterProject, "confirmation", "confirmation-success")).toBe(starterProject);
  });

  it("protects the flow's initial state even when no action or outcome references it", () => {
    const project = structuredClone(starterProject);
    project.nodes[0].states.push({ id: "checkout-loading", name: "Loading", kind: "loading" });
    project.interactions = [];
    expect(getStateRemovalReason(project, "checkout", "checkout-idle"))
      .toBe("This is the flow’s initial state.");
    expect(removeUnusedState(project, "checkout", "checkout-idle")).toBe(project);
    expect(getStateRemovalReason(project, "checkout", "checkout-loading")).toBeNull();
  });

  it("distinguishes state-scoped actions from actions available in every state", () => {
    const project = structuredClone(starterProject);
    expect(getStateRemovalReason(project, "payment-error", "payment-error-idle")).toBeNull();
    project.interactions[1].sourceStateId = "payment-error-idle";
    expect(getStateRemovalReason(project, "payment-error", "payment-error-idle"))
      .toBe("An action is only available in this state.");
    expect(removeUnusedState(project, "payment-error", "payment-error-idle")).toBe(project);
  });

  it("explains both explicit outcome destinations and destinations using the initial state", () => {
    const project = structuredClone(starterProject);
    expect(getStateRemovalReason(project, "payment-error", "payment-error-error"))
      .toBe("An outcome arrives in this state.");
    project.interactions[0].outcomes[1].target!.stateId = null;
    expect(getStateRemovalReason(project, "payment-error", "payment-error-error"))
      .toBe("An outcome uses this screen’s initial state.");
    expect(removeUnusedState(project, "payment-error", "payment-error-error")).toBe(project);
    expect(getStateRemovalReason(project, "payment-error", "payment-error-idle")).toBeNull();
  });

  it("allows an unused initial state to be removed and preserves custom states", () => {
    const project = structuredClone(starterProject);
    const node = project.nodes.find((item) => item.id === "payment-error")!;
    node.states.push({ id: "payment-error-card-expired", name: "Card expired", kind: "custom" });
    project.interactions[0].outcomes[1].target!.stateId = "payment-error-idle";
    expect(getStateRemovalReason(project, node.id, "payment-error-error")).toBeNull();
    const next = removeUnusedState(project, node.id, "payment-error-error");
    const nextNode = next.nodes.find((item) => item.id === node.id)!;
    expect(nextNode.initialStateId).toBe("payment-error-idle");
    expect(nextNode.states.map((state) => state.id)).toEqual(["payment-error-idle", "payment-error-card-expired"]);
    expect(next.interactions).toBe(project.interactions);
    expect(getStateRemovalReason(next, node.id, "payment-error-card-expired")).toBeNull();
    expect(removeUnusedState(next, node.id, "payment-error-card-expired").nodes.find((item) => item.id === node.id)?.states)
      .toHaveLength(1);
  });

  it("safely handles stale screen and state selections", () => {
    expect(getStateRemovalReason(starterProject, "missing-screen", "payment-error-idle"))
      .toBe("This screen no longer exists.");
    expect(getStateRemovalReason(starterProject, "payment-error", "missing-state"))
      .toBe("This state no longer exists.");
    expect(removeUnusedState(starterProject, "missing-screen", "payment-error-idle")).toBe(starterProject);
    expect(removeUnusedState(starterProject, "payment-error", "missing-state")).toBe(starterProject);
  });
});
