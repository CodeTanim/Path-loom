import { describe, expect, it } from "vitest";
import { recordExploredOutcome } from "../../src/domain/exploration";
import { setOutcomeReview } from "../../src/domain/outcome-reviews";
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

function review(overrides: Partial<Parameters<typeof setOutcomeReview>[1]> = {}) {
  return {
    interactionId: "pay",
    outcomeId: "pay-success",
    sourceNodeId: "checkout",
    sourceStateId: "checkout-idle",
    note: "The confirmation needs an order number.",
    status: "needs-work" as const,
    ...overrides,
  };
}

describe("saved outcome reviews", () => {
  it("reopens a flag and its source context without changing exploration or another flow", () => {
    const storage = memoryStorage();
    const initial = createProject("example");
    const original = saveProject(storage, updateProject(initial, recordExploredOutcome(
      initial.document, "pay", "pay-success", "checkout-idle",
    )));
    const other = saveProject(storage, createProject("example"));
    const flagged = updateProject(original, setOutcomeReview(original.document, review()));
    saveProject(storage, flagged);

    const reopened = getProject(storage, original.id)!;
    expect(reopened.document.outcomeReviews).toEqual(flagged.document.outcomeReviews);
    expect(reopened.document.outcomeReviews?.items).toEqual([review()]);
    expect(reopened.document.exploration).toEqual(original.document.exploration);
    expect(reopened.document.nodes).toEqual(original.document.nodes);
    expect(reopened.document.interactions).toEqual(original.document.interactions);
    expect(getProject(storage, other.id)!.document.outcomeReviews).toBeUndefined();
  });

  it("duplicates the review history into an independently editable project", () => {
    const storage = memoryStorage();
    const initial = createProject("example");
    const original = saveProject(storage, updateProject(initial, setOutcomeReview(initial.document, review())));
    const duplicate = duplicateProject(original);
    expect(duplicate.document.outcomeReviews).toEqual(original.document.outcomeReviews);
    expect(duplicate.document.outcomeReviews).not.toBe(original.document.outcomeReviews);
    expect(duplicate.document.outcomeReviews!.items[0]).not.toBe(original.document.outcomeReviews!.items[0]);

    const resolvedReview = review({ status: "resolved", note: "Order number added to confirmation." });
    saveProject(storage, updateProject(duplicate, setOutcomeReview(duplicate.document, resolvedReview)));

    expect(getProject(storage, duplicate.id)!.document.outcomeReviews?.items).toEqual([resolvedReview]);
    expect(getProject(storage, original.id)!.document.outcomeReviews?.items).toEqual([review()]);
  });

  it("preserves the last saved review after a storage failure and retries the newer in-memory note and status", () => {
    const storage = memoryStorage();
    const initial = createProject("example");
    const original = saveProject(storage, updateProject(initial, setOutcomeReview(initial.document, review())));
    const resolvedReview = review({ status: "resolved", note: "Fixed the missing order number." });
    const resolved = updateProject(original, setOutcomeReview(original.document, resolvedReview));
    const fullStorage = {
      getItem: storage.getItem,
      setItem: () => { throw new Error("Storage quota exceeded"); },
    };

    expect(() => saveProject(fullStorage, resolved)).toThrow(/could not be saved/);
    expect(getProject(storage, original.id)!.document.outcomeReviews?.items).toEqual([review()]);
    expect(resolved.document.outcomeReviews?.items).toEqual([resolvedReview]);

    saveProject(storage, resolved);
    expect(getProject(storage, original.id)!.document.outcomeReviews?.items).toEqual([resolvedReview]);
  });

  it("marks review-only account edits dirty, preserves them against old cloud data, and isolates the account cache", () => {
    const storage = memoryStorage();
    const initial = createProject("example");
    const cloud = {
      id: initial.id,
      document: initial.document,
      revision: 2,
      updatedAt: initial.updatedAt,
    };
    const cached = mergeCloudProject(undefined, cloud, "alice");
    expect(cached.dirty).toBe(false);
    const flagged = updateProject(cached, setOutcomeReview(cached.document, review()));
    expect(flagged.dirty).toBe(true);
    expect(flagged.cloud).toEqual({ ownerId: "alice", revision: 2 });
    expect(mergeCloudProject(flagged, cloud, "alice")).toBe(flagged);
    saveProject(storage, flagged, "alice");

    expect(getProject(storage, initial.id, "alice")!.document.outcomeReviews?.items).toEqual([review()]);
    expect(getProject(storage, initial.id)).toBeUndefined();
    expect(getProject(storage, initial.id, "bob")).toBeUndefined();
  });

  it.each([
    {
      name: "newer explanation",
      sentReview: review(),
      currentReview: review({ note: "Also include a copyable order reference." }),
    },
    {
      name: "resolved flag",
      sentReview: review(),
      currentReview: review({ status: "resolved", note: "Order number is now shown." }),
    },
    {
      name: "reopened flag",
      sentReview: review({ status: "resolved", note: "Order number is now shown." }),
      currentReview: review({ status: "needs-work", note: "Order number is missing after retrying." }),
    },
  ])("does not let an in-flight cloud acknowledgement overwrite a $name", ({ sentReview, currentReview }) => {
    const storage = memoryStorage();
    const initial = {
      ...createProject("example"),
      cloud: { ownerId: "alice", revision: 2 },
      dirty: false,
    };
    const sent = updateProject(initial, setOutcomeReview(initial.document, sentReview));
    const current = updateProject(sent, setOutcomeReview(sent.document, currentReview));
    const cloud = {
      id: sent.id,
      document: structuredClone(sent.document),
      revision: 3,
      updatedAt: "2026-09-14T20:00:00.000Z",
    };
    const acknowledged = acknowledgeCloudSave(current, sent, cloud, "alice");

    expect(acknowledged.document).toBe(current.document);
    expect(acknowledged.document.outcomeReviews?.items).toEqual([currentReview]);
    expect(sent.document.outcomeReviews?.items).toEqual([sentReview]);
    expect(acknowledged.dirty).toBe(true);
    expect(acknowledged.cloud).toEqual({ ownerId: "alice", revision: 3 });
    saveProject(storage, acknowledged, "alice");
    expect(getProject(storage, current.id, "alice")!.document.outcomeReviews?.items).toEqual([currentReview]);
  });

  it("marks an acknowledged review clean only when no newer review edits remain", () => {
    const initial = {
      ...createProject("example"),
      cloud: { ownerId: "alice", revision: 2 },
      dirty: false,
    };
    const resolvedReview = review({ status: "resolved" });
    const sent = updateProject(initial, setOutcomeReview(initial.document, resolvedReview));
    const cloud = {
      id: sent.id,
      document: structuredClone(sent.document),
      revision: 3,
      updatedAt: "2026-09-14T20:00:00.000Z",
    };

    const acknowledged = acknowledgeCloudSave(sent, sent, cloud, "alice");
    expect(acknowledged.dirty).toBe(false);
    expect(acknowledged.updatedAt).toBe(cloud.updatedAt);
    expect(acknowledged.document.outcomeReviews?.items).toEqual([resolvedReview]);
  });
});
