import { describe, expect, it } from "vitest";
import { parsePathloomDocument } from "../../src/domain/validate";
import { starterProject } from "../../src/domain/samples/starter";
import {
  createProject,
  documentsEqual,
  duplicateProject,
  getProject,
  LEGACY_PROJECT_KEY,
  LibraryError,
  libraryStorageKey,
  loadLibrary,
  mergeCloudProject,
  renameProject,
  saveProject,
  updateProject,
} from "../../src/features/projects/library";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function reorderObjectKeys<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    return Object.fromEntries(Object.entries(entry).reverse());
  })) as T;
}

describe("guest project library", () => {
  it("starts empty and creates independently editable blank and example documents", () => {
    const storage = memoryStorage();
    expect(loadLibrary(storage)).toEqual([]);
    expect(storage.values.size).toBe(0);
    const blank = createProject("blank");
    const example = createProject("example", "Checkout experiment");
    expect(blank.document.nodes).toHaveLength(1);
    expect(blank.document.nodes[0].id).toBe(blank.document.entryNodeId);
    expect(blank.document.nodes[0].states.some((state) => state.id === blank.document.nodes[0].initialStateId)).toBe(true);
    expect(example.document.name).toBe("Checkout experiment");
    expect(example.id).not.toBe(blank.id);
    expect(example.id).not.toBe(starterProject.id);
    expect(parsePathloomDocument(JSON.stringify(blank.document))).toEqual(blank.document);
    example.document.nodes[0].name = "Changed";
    expect(starterProject.nodes[0].name).toBe("Checkout");
  });

  it("persists multiple flows, renames only the chosen flow, and reopens it", () => {
    const storage = memoryStorage();
    const first = saveProject(storage, createProject("blank"));
    const second = saveProject(storage, createProject("example"));
    saveProject(storage, renameProject(first, "  Sign in  "));
    expect(loadLibrary(storage)).toHaveLength(2);
    expect(getProject(storage, first.id)?.document.name).toBe("Sign in");
    expect(getProject(storage, second.id)).toEqual(second);
    expect(() => renameProject(first, " ")).toThrow(LibraryError);
  });

  it("migrates the previous draft once, assigns a unique ID, and leaves the original untouched", () => {
    const previous = structuredClone(starterProject);
    previous.nodes[0].name = "My existing checkout";
    const serialized = JSON.stringify(previous);
    const storage = memoryStorage({ [LEGACY_PROJECT_KEY]: serialized });
    const [migrated] = loadLibrary(storage);
    expect(migrated.id).not.toBe(previous.id);
    expect(migrated.document).toEqual({ ...previous, id: migrated.id });
    expect(loadLibrary(storage)).toEqual([migrated]);
    expect(storage.getItem(LEGACY_PROJECT_KEY)).toBe(serialized);
    const otherBrowser = memoryStorage({ [LEGACY_PROJECT_KEY]: serialized });
    expect(loadLibrary(otherBrowser)[0].id).not.toBe(migrated.id);
  });

  it("preserves an existing UUID when migrating a draft", () => {
    const previous = createProject("blank").document;
    const storage = memoryStorage({ [LEGACY_PROJECT_KEY]: JSON.stringify(previous) });
    expect(loadLibrary(storage)[0].id).toBe(previous.id);
  });

  it("does not overwrite a corrupt library or an invalid original draft", () => {
    for (const [key, saved] of [
      [libraryStorageKey(), "{broken"],
      [LEGACY_PROJECT_KEY, JSON.stringify({ ...starterProject, nodes: "invalid" })],
    ]) {
      const storage = memoryStorage({ [key]: saved });
      expect(() => loadLibrary(storage)).toThrow(LibraryError);
      expect(() => saveProject(storage, createProject("blank"))).toThrow(LibraryError);
      expect(storage.getItem(key)).toBe(saved);
      expect(storage.values.size).toBe(1);
    }
  });

  it("keeps the whole saved library if one nested record is malformed", () => {
    const storage = memoryStorage();
    saveProject(storage, createProject("blank"));
    const key = libraryStorageKey();
    const corrupted = JSON.parse(storage.getItem(key)!);
    corrupted.projects.push({ ...createProject("example"), document: { invalid: true } });
    const original = JSON.stringify(corrupted);
    storage.setItem(key, original);
    expect(() => saveProject(storage, createProject("blank"))).toThrow(/will not be overwritten/);
    expect(storage.getItem(key)).toBe(original);
  });

  it("reports unavailable and full storage without claiming the project was saved", () => {
    expect(() => loadLibrary({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} })).toThrow(/storage is unavailable/);
    const record = createProject("blank");
    expect(() => saveProject({ getItem: () => null, setItem: () => { throw new Error("quota"); } }, record)).toThrow(/could not be saved/);
  });

  it("duplicates without retaining cloud ownership or changing the original", () => {
    const original = { ...createProject("example"), cloud: { ownerId: "alice", revision: 4 }, dirty: false };
    const duplicate = duplicateProject(original);
    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.document.id).toBe(duplicate.id);
    expect(duplicate.document.name).toBe(`${original.document.name} (copy)`);
    expect(duplicate.cloud).toBeUndefined();
    expect(duplicate.dirty).toBe(true);
    duplicate.document.nodes[0].name = "Duplicated screen";
    expect(original.document.nodes[0].name).toBe("Checkout");
  });

  it("marks a changed document dirty while preserving its cloud base revision", () => {
    const original = { ...createProject("blank"), cloud: { ownerId: "alice", revision: 4 }, dirty: false };
    expect(updateProject(original, structuredClone(original.document))).toBe(original);
    const edited = updateProject(original, { ...original.document, name: "Changed" });
    expect(edited.dirty).toBe(true);
    expect(edited.cloud).toEqual(original.cloud);
    expect(original.document.name).toBe("Untitled flow");
    expect(() => updateProject(original, { ...original.document, id: "another" })).toThrow(LibraryError);
  });

  it("treats reordered JSON object keys as the same document but keeps array order meaningful", () => {
    const original = { ...createProject("example"), dirty: false };
    const reordered = reorderObjectKeys(original.document);
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(original.document));
    expect(documentsEqual(original.document, reordered)).toBe(true);
    expect(updateProject(original, reordered)).toBe(original);
    const reorderedScreens = { ...reordered, nodes: [...reordered.nodes].reverse() };
    expect(documentsEqual(original.document, reorderedScreens)).toBe(false);
    expect(updateProject(original, reorderedScreens).dirty).toBe(true);
  });

  it("does not duplicate an already imported UUID draft when only its JSON key order differs", () => {
    const storage = memoryStorage();
    const original = saveProject(storage, createProject("example"));
    storage.setItem(LEGACY_PROJECT_KEY, JSON.stringify(reorderObjectKeys(original.document)));
    expect(loadLibrary(storage)).toEqual([original]);
  });
});

describe("account cache isolation and merging", () => {
  it("isolates guest, Alice, and Bob projects, including legacy draft migration", () => {
    const storage = memoryStorage({ [LEGACY_PROJECT_KEY]: JSON.stringify(starterProject) });
    expect(loadLibrary(storage, "alice")).toEqual([]);
    expect(storage.values.size).toBe(1);
    const guest = loadLibrary(storage)[0];
    const alice = { ...createProject("blank"), cloud: { ownerId: "alice", revision: 1 }, dirty: false };
    saveProject(storage, alice, "alice");
    expect(loadLibrary(storage, "alice")).toEqual([alice]);
    expect(loadLibrary(storage, "bob")).toEqual([]);
    expect(loadLibrary(storage)).toEqual([guest]);
    expect(() => saveProject(storage, alice, "bob")).toThrow(/different account/);
    expect(() => saveProject(storage, alice)).toThrow(/different account/);
  });

  it("refuses to expose records tagged with another account's ownership", () => {
    const storage = memoryStorage();
    const alice = { ...createProject("blank"), cloud: { ownerId: "alice", revision: 1 }, dirty: false };
    saveProject(storage, alice, "alice");
    storage.setItem(libraryStorageKey("bob"), storage.getItem(libraryStorageKey("alice"))!);
    expect(() => loadLibrary(storage, "bob")).toThrow(/different account/);
  });

  it("accepts fetched cloud records and keeps unsubmitted edits for conflict resolution", () => {
    const original = createProject("blank");
    const cloud = { id: original.id, document: original.document, revision: 3, updatedAt: original.updatedAt };
    const cached = mergeCloudProject(undefined, cloud, "alice");
    expect(cached.cloud).toEqual({ ownerId: "alice", revision: 3 });
    expect(cached.dirty).toBe(false);
    const edited = renameProject(cached, "Unsent edits");
    const newerCloud = { ...cloud, document: { ...cloud.document, name: "Other device" }, revision: 4 };
    expect(mergeCloudProject(edited, newerCloud, "alice")).toBe(edited);
    expect(mergeCloudProject(cached, newerCloud, "alice").document.name).toBe("Other device");
    expect(() => mergeCloudProject(cached, newerCloud, "bob")).toThrow(/different account/);
  });

  it("acknowledges an identical cloud save but never rolls the base revision back", () => {
    const edited = { ...createProject("blank"), cloud: { ownerId: "alice", revision: 3 } };
    const matchingCloud = { id: edited.id, document: edited.document, revision: 4, updatedAt: edited.updatedAt };
    expect(mergeCloudProject(edited, matchingCloud, "alice")).toMatchObject({ dirty: false, cloud: { revision: 4 } });
    expect(mergeCloudProject(edited, { ...matchingCloud, revision: 2 }, "alice")).toBe(edited);
  });

  it("recognizes an identical JSONB document with reordered keys as saved", () => {
    const edited = { ...createProject("example"), cloud: { ownerId: "alice", revision: 3 } };
    const cloud = { id: edited.id, document: reorderObjectKeys(edited.document), revision: 4, updatedAt: edited.updatedAt };
    expect(mergeCloudProject(edited, cloud, "alice")).toMatchObject({ dirty: false, cloud: { revision: 4 } });
  });
});
