import { describe, expect, it } from "vitest";
import type { CloudProject } from "../../src/lib/cloud/types";
import { createProject, renameProject, type LocalProject } from "../../src/features/projects/library";
import { acknowledgeCloudSave, combineProjects } from "../../src/features/projects/sync";

function savingProject() {
  const sent: LocalProject = {
    ...createProject("blank"),
    cloud: { ownerId: "alice", revision: 2 },
    updatedAt: "2026-09-07T20:00:00.000Z",
  };
  const cloud: CloudProject = {
    id: sent.id,
    document: structuredClone(sent.document),
    revision: 3,
    updatedAt: "2026-09-07T20:01:00.000Z",
  };
  return { sent, cloud };
}

describe("cloud save acknowledgements", () => {
  it("marks the sent version clean and adopts the server timestamp and revision", () => {
    const { sent, cloud } = savingProject();
    const result = acknowledgeCloudSave(sent, sent, cloud, "alice");
    expect(result).toEqual({ ...sent, dirty: false, cloud: { ownerId: "alice", revision: 3 }, updatedAt: cloud.updatedAt });
    expect(result.document).toBe(sent.document);
    expect(sent.dirty).toBe(true);
  });

  it("keeps edits made during the request dirty while advancing their base revision", () => {
    const { sent, cloud } = savingProject();
    const current = { ...renameProject(sent, "Edited while saving"), updatedAt: "2026-09-07T20:00:30.000Z" };
    const result = acknowledgeCloudSave(current, sent, cloud, "alice");
    expect(result.document).toBe(current.document);
    expect(result.document.name).toBe("Edited while saving");
    expect(result.dirty).toBe(true);
    expect(result.cloud).toEqual({ ownerId: "alice", revision: 3 });
    expect(result.updatedAt).toBe(current.updatedAt);
  });

  it("accepts JSONB key reordering at every level while preserving in-flight edits", () => {
    const { sent, cloud } = savingProject();
    const reorderedCloud = {
      ...cloud,
      document: JSON.parse(JSON.stringify(cloud.document, (_key, value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return value;
        return Object.fromEntries(Object.entries(value).reverse());
      })),
    };
    expect(JSON.stringify(reorderedCloud.document)).not.toBe(JSON.stringify(sent.document));
    expect(acknowledgeCloudSave(sent, sent, reorderedCloud, "alice")).toMatchObject({ dirty: false, cloud: { revision: 3 } });
    const current = renameProject(sent, "Still editing");
    expect(acknowledgeCloudSave(current, sent, reorderedCloud, "alice")).toMatchObject({ dirty: true, document: { name: "Still editing" }, cloud: { revision: 3 } });
  });

  it("attaches the account to the first cloud save of a guest draft", () => {
    const { sent, cloud } = savingProject();
    const guest = { ...sent, cloud: undefined };
    expect(acknowledgeCloudSave(guest, guest, cloud, "alice")).toMatchObject({ dirty: false, cloud: { ownerId: "alice", revision: 3 } });
  });

  it("does not use another project's response or a changed document as confirmation", () => {
    const { sent, cloud } = savingProject();
    const other = createProject("blank");
    expect(() => acknowledgeCloudSave(other, sent, cloud, "alice")).toThrow(/different project/);
    expect(() => acknowledgeCloudSave(sent, other, cloud, "alice")).toThrow(/different project/);
    expect(() => acknowledgeCloudSave(sent, sent, { ...cloud, id: other.id }, "alice")).toThrow(/different project/);
    expect(() => acknowledgeCloudSave(sent, sent, { ...cloud, document: { ...cloud.document, name: "Unexpected version" } }, "alice")).toThrow(/does not match/);
  });

  it("rejects account changes both during and before the save", () => {
    const { sent, cloud } = savingProject();
    expect(() => acknowledgeCloudSave(sent, sent, cloud, "bob")).toThrow(/different account/);
    const current = { ...sent, cloud: { ownerId: "bob", revision: 2 } };
    expect(() => acknowledgeCloudSave(current, sent, cloud, "alice")).toThrow(/different account/);
    const guestCurrent = { ...sent, cloud: undefined };
    expect(() => acknowledgeCloudSave(guestCurrent, sent, cloud, "bob")).toThrow(/different account/);
  });

  it("ignores an out-of-order response after a newer version is already acknowledged", () => {
    const { sent, cloud } = savingProject();
    const current = { ...renameProject(sent, "Newer saved version"), cloud: { ownerId: "alice", revision: 4 }, dirty: false };
    expect(acknowledgeCloudSave(current, sent, cloud, "alice")).toBe(current);
  });
});

describe("combined project list", () => {
  it("shows each project once with account cache priority and recent projects first", () => {
    const guestBackup = { ...createProject("blank"), updatedAt: "2026-09-07T22:00:00.000Z" };
    const account = { ...renameProject(guestBackup, "Online version"), updatedAt: "2026-09-07T20:00:00.000Z", cloud: { ownerId: "alice", revision: 2 } };
    const newest = { ...createProject("example"), updatedAt: "2026-09-07T21:00:00.000Z" };
    const oldest = { ...createProject("blank"), updatedAt: "2026-09-07T19:00:00.000Z" };
    const guest = [guestBackup, oldest, newest];
    const accountProjects = [account];
    expect(combineProjects(guest, accountProjects)).toEqual([newest, account, oldest]);
    expect(guest).toEqual([guestBackup, oldest, newest]);
    expect(accountProjects).toEqual([account]);
  });

  it("keeps the latest duplicate within a source regardless of input order", () => {
    const first = { ...createProject("blank"), updatedAt: "2026-09-07T20:00:00.000Z" };
    const latest = { ...renameProject(first, "Latest"), updatedAt: "2026-09-07T21:00:00.000Z" };
    expect(combineProjects([latest, first], [])).toEqual([latest]);
    expect(combineProjects([], [first, latest])).toEqual([latest]);
    expect(combineProjects([], [])).toEqual([]);
  });
});
