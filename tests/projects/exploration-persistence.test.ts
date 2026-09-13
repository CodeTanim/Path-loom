import { describe, expect, it } from "vitest";
import {
  getExplorationSummary,
  reconcileExploration,
  recordExploredOutcome,
} from "../../src/domain/exploration";
import {
  createProject,
  duplicateProject,
  getProject,
  mergeCloudProject,
  saveProject,
  updateProject,
} from "../../src/features/projects/library";
import { acknowledgeCloudSave } from "../../src/features/projects/sync";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("saved exploration progress", () => {
  it("reopens explored outcome-state checks without changing another flow", () => {
    const storage = memoryStorage();
    const original = saveProject(storage, createProject("example"));
    const other = saveProject(storage, createProject("example"));
    const explored = updateProject(original, recordExploredOutcome(
      original.document, "pay", "pay-success", "checkout-idle",
    ));
    saveProject(storage, explored);

    const reopened = getProject(storage, original.id)!;
    expect(reopened.document.exploration).toEqual(explored.document.exploration);
    expect(getExplorationSummary(reopened.document)).toMatchObject({
      total: 3, explored: 1, unexplored: 2,
    });
    expect(getExplorationSummary(getProject(storage, other.id)!.document).explored).toBe(0);
    expect(reopened.document.nodes).toEqual(original.document.nodes);
    expect(reopened.document.interactions).toEqual(original.document.interactions);
  });

  it("copies progress into an independently editable duplicate", () => {
    const storage = memoryStorage();
    const initial = createProject("example");
    const original = saveProject(storage, updateProject(initial, recordExploredOutcome(
      initial.document, "pay", "pay-success", "checkout-idle",
    )));
    const duplicate = duplicateProject(original);
    expect(duplicate.document.exploration).toEqual(original.document.exploration);
    expect(duplicate.document.exploration).not.toBe(original.document.exploration);
    expect(duplicate.document.exploration!.visits[0]).not.toBe(original.document.exploration!.visits[0]);

    const exploredCopy = updateProject(duplicate, recordExploredOutcome(
      duplicate.document, "pay", "pay-declined", "checkout-idle",
    ));
    saveProject(storage, exploredCopy);
    expect(getExplorationSummary(getProject(storage, duplicate.id)!.document).explored).toBe(2);
    expect(getExplorationSummary(getProject(storage, original.id)!.document).explored).toBe(1);
  });

  it("keeps the last saved progress when storage fails and permits retrying the in-memory document", () => {
    const storage = memoryStorage();
    const original = saveProject(storage, createProject("example"));
    const explored = updateProject(original, recordExploredOutcome(
      original.document, "pay", "pay-success", "checkout-idle",
    ));
    const fullStorage = {
      getItem: storage.getItem,
      setItem: () => { throw new Error("Storage quota exceeded"); },
    };

    expect(() => saveProject(fullStorage, explored)).toThrow(/could not be saved/);
    expect(getExplorationSummary(getProject(storage, original.id)!.document).explored).toBe(0);
    expect(getExplorationSummary(explored.document).explored).toBe(1);
    saveProject(storage, explored);
    expect(getExplorationSummary(getProject(storage, original.id)!.document).explored).toBe(1);
  });

  it("persists change-aware invalidation so a changed destination needs another exploration after reopening", () => {
    const storage = memoryStorage();
    const initial = createProject("example");
    const explored = saveProject(storage, updateProject(initial, recordExploredOutcome(
      initial.document, "pay", "pay-success", "checkout-idle",
    )));
    const changed = reconcileExploration({
      ...explored.document,
      nodes: explored.document.nodes.map((node) => node.id === "confirmation"
        ? { ...node, description: "Show the updated confirmation content." }
        : node),
    });
    saveProject(storage, updateProject(explored, changed));

    const reopened = getProject(storage, initial.id)!;
    expect(reopened.document.exploration?.visits).toHaveLength(0);
    expect(getExplorationSummary(reopened.document).checks.find((check) =>
      check.outcomeId === "pay-success",
    )?.status).toBe("unexplored");
  });

  it("marks exploration-only account changes dirty and preserves them over an older cloud document", () => {
    const storage = memoryStorage();
    const initial = createProject("example");
    const cloud = {
      id: initial.id,
      document: initial.document,
      revision: 2,
      updatedAt: initial.updatedAt,
    };
    const cached = mergeCloudProject(undefined, cloud, "alice");
    const explored = updateProject(cached, recordExploredOutcome(
      cached.document, "pay", "pay-success", "checkout-idle",
    ));
    expect(explored.dirty).toBe(true);
    expect(explored.cloud).toEqual({ ownerId: "alice", revision: 2 });
    expect(mergeCloudProject(explored, cloud, "alice")).toBe(explored);
    saveProject(storage, explored, "alice");

    expect(getExplorationSummary(getProject(storage, explored.id, "alice")!.document).explored).toBe(1);
    expect(getProject(storage, explored.id)).toBeUndefined();
    expect(getProject(storage, explored.id, "bob")).toBeUndefined();
  });

  it("does not let an in-flight cloud acknowledgement erase newer explored outcomes", () => {
    const storage = memoryStorage();
    const initial = {
      ...createProject("example"),
      cloud: { ownerId: "alice", revision: 2 },
      dirty: false,
    };
    const sent = updateProject(initial, recordExploredOutcome(
      initial.document, "pay", "pay-success", "checkout-idle",
    ));
    const current = updateProject(sent, recordExploredOutcome(
      sent.document, "pay", "pay-declined", "checkout-idle",
    ));
    const cloud = {
      id: sent.id,
      document: structuredClone(sent.document),
      revision: 3,
      updatedAt: "2026-09-09T20:00:00.000Z",
    };
    const acknowledged = acknowledgeCloudSave(current, sent, cloud, "alice");
    expect(acknowledged.document).toBe(current.document);
    expect(acknowledged.dirty).toBe(true);
    expect(acknowledged.cloud).toEqual({ ownerId: "alice", revision: 3 });
    expect(getExplorationSummary(acknowledged.document).explored).toBe(2);
    expect(getExplorationSummary(sent.document).explored).toBe(1);
    saveProject(storage, acknowledged, "alice");
    expect(getExplorationSummary(getProject(storage, current.id, "alice")!.document).explored).toBe(2);
  });
});
