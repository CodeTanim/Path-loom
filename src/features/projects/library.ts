import type { ProjectDocument } from "../../domain/model";
import { starterProject } from "../../domain/samples/starter";
import { parsePathloomDocument } from "../../domain/validate";
import type { CloudProject } from "../../lib/cloud/types";

export interface LocalProject {
  id: string;
  document: ProjectDocument;
  updatedAt: string;
  cloud?: { ownerId: string; revision: number };
  dirty: boolean;
}

type ProjectStorage = Pick<Storage, "getItem" | "setItem">;
type LibraryScope = string | null | undefined;

interface StoredLibrary {
  schemaVersion: 1;
  projects: LocalProject[];
  legacyMigrationComplete: boolean;
}

export const LEGACY_PROJECT_KEY = "pathloom:v1:project:checkout-recovery";
export const MAX_LOCAL_PROJECTS = 100;

export class LibraryError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_project"
      | "invalid_library"
      | "storage_read"
      | "storage_write"
      | "wrong_account"
      | "project_limit",
  ) {
    super(message);
    this.name = "LibraryError";
  }
}

export function libraryStorageKey(scope?: LibraryScope): string {
  if (scope == null) return "pathloom:v1:library:guest";
  if (!scope.trim()) {
    throw new LibraryError("The account could not be identified.", "wrong_account");
  }
  return `pathloom:v1:library:account:${encodeURIComponent(scope)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) =>
    [key, canonicalJsonValue(value[key])],
  ));
}

/** JSONB and other serializers may reorder object keys without changing data. */
export function documentsEqual(left: ProjectDocument, right: ProjectDocument): boolean {
  return JSON.stringify(canonicalJsonValue(left)) === JSON.stringify(canonicalJsonValue(right));
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validatedDocument(value: unknown): ProjectDocument {
  let document: ProjectDocument | null = null;
  try {
    document = parsePathloomDocument(JSON.stringify(value));
  } catch {
    // Circular/non-JSON input is invalid, just like malformed saved JSON.
  }
  if (!document) {
    throw new LibraryError(
      "This project could not be read. Its original saved data has been kept.",
      "invalid_project",
    );
  }
  return document;
}

function validatedRecord(value: unknown): LocalProject {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    !validDate(value.updatedAt) ||
    typeof value.dirty !== "boolean"
  ) {
    throw new LibraryError("A saved project record is invalid.", "invalid_project");
  }
  const document = validatedDocument(value.document);
  if (document.id !== value.id) {
    throw new LibraryError("A saved project has conflicting IDs.", "invalid_project");
  }
  const cloud = value.cloud;
  if (
    cloud !== undefined &&
    (!isRecord(cloud) ||
      typeof cloud.ownerId !== "string" ||
      !cloud.ownerId.trim() ||
      !validRevision(cloud.revision))
  ) {
    throw new LibraryError("A saved project's cloud details are invalid.", "invalid_project");
  }
  return {
    id: value.id,
    document,
    updatedAt: value.updatedAt,
    dirty: value.dirty,
    ...(cloud === undefined
      ? {}
      : { cloud: { ownerId: cloud.ownerId as string, revision: cloud.revision as number } }),
  };
}

function assertScope(record: LocalProject, scope: LibraryScope) {
  if (record.cloud && record.cloud.ownerId !== scope) {
    throw new LibraryError(
      "This project belongs to a different account. Switch back to that account to open it.",
      "wrong_account",
    );
  }
}

function readItem(storage: ProjectStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    throw new LibraryError(
      "Browser storage is unavailable. Allow site storage to open your saved projects.",
      "storage_read",
    );
  }
}

function writeLibrary(storage: ProjectStorage, scope: LibraryScope, library: StoredLibrary) {
  try {
    storage.setItem(libraryStorageKey(scope), JSON.stringify(library));
  } catch (error) {
    if (error instanceof LibraryError) throw error;
    throw new LibraryError(
      "Your latest changes could not be saved in this browser. Storage may be full or disabled. Keep this page open and allow site storage or free up browser storage.",
      "storage_write",
    );
  }
}

function parseLibrary(serialized: string, scope: LibraryScope): StoredLibrary {
  try {
    const value: unknown = JSON.parse(serialized);
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.projects) ||
      value.projects.length > MAX_LOCAL_PROJECTS ||
      typeof value.legacyMigrationComplete !== "boolean"
    ) {
      throw new Error("Invalid library envelope");
    }
    const projects = value.projects.map(validatedRecord);
    if (new Set(projects.map((project) => project.id)).size !== projects.length) {
      throw new Error("Duplicate project IDs");
    }
    projects.forEach((project) => assertScope(project, scope));
    return { schemaVersion: 1, projects, legacyMigrationComplete: value.legacyMigrationComplete };
  } catch (error) {
    if (error instanceof LibraryError && error.code === "wrong_account") throw error;
    throw new LibraryError(
      "Your saved project library could not be read. The original data has been kept and will not be overwritten.",
      "invalid_library",
    );
  }
}

function readLibrary(storage: ProjectStorage, scope: LibraryScope): StoredLibrary {
  const saved = readItem(storage, libraryStorageKey(scope));
  const library: StoredLibrary = saved === null
    ? { schemaVersion: 1, projects: [], legacyMigrationComplete: false }
    : parseLibrary(saved, scope);

  // An account cache must never implicitly import drafts from another session.
  if (scope != null || library.legacyMigrationComplete) return library;
  const legacy = readItem(storage, LEGACY_PROJECT_KEY);
  if (legacy === null) return library;
  const document = parsePathloomDocument(legacy);
  if (!document) {
    throw new LibraryError(
      "Your previous draft could not be read. Its original data has been kept.",
      "invalid_project",
    );
  }

  // Older examples share a seed ID across browsers. Assign an independent ID
  // before the first cloud save so two real projects cannot collide there.
  const hasUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(document.id);
  const matching = hasUuid && library.projects.find((project) =>
    project.id === document.id && documentsEqual(project.document, document),
  );
  if (!matching) {
    if (library.projects.length >= MAX_LOCAL_PROJECTS) {
      throw new LibraryError("This browser already has the maximum number of saved projects.", "project_limit");
    }
    if (!hasUuid || library.projects.some((project) => project.id === document.id)) {
      document.id = crypto.randomUUID();
    }
    library.projects.push({ id: document.id, document, updatedAt: new Date().toISOString(), dirty: true });
  }
  library.legacyMigrationComplete = true;
  // Keep the old key as an untouched backup. A single atomic library write
  // stores both the imported record and its migration marker.
  writeLibrary(storage, scope, library);
  return library;
}

export function loadLibrary(storage: ProjectStorage, scope?: LibraryScope): LocalProject[] {
  return readLibrary(storage, scope).projects.sort((a, b) =>
    Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export function getProject(storage: ProjectStorage, id: string, scope?: LibraryScope): LocalProject | undefined {
  return loadLibrary(storage, scope).find((project) => project.id === id);
}

export function saveProject(storage: ProjectStorage, record: LocalProject, scope?: LibraryScope): LocalProject {
  const project = validatedRecord(record);
  assertScope(project, scope);
  const library = readLibrary(storage, scope);
  const index = library.projects.findIndex((entry) => entry.id === project.id);
  if (index >= 0) library.projects[index] = project;
  else {
    if (library.projects.length >= MAX_LOCAL_PROJECTS) {
      throw new LibraryError("This browser already has the maximum number of saved projects.", "project_limit");
    }
    library.projects.push(project);
  }
  writeLibrary(storage, scope, library);
  return project;
}

export function createProject(kind: "blank" | "example", name?: string): LocalProject {
  const id = crypto.randomUUID();
  const document: ProjectDocument = kind === "example"
    ? { ...structuredClone(starterProject), id }
    : {
        schemaVersion: 1,
        id,
        name: "Untitled flow",
        entryNodeId: "start",
        nodes: [{
          id: "start",
          name: "Start screen",
          kind: "screen",
          position: { x: 80, y: 120 },
          states: [{ id: "start-idle", name: "Ready", kind: "idle" }],
          initialStateId: "start-idle",
        }],
        interactions: [],
      };
  if (name?.trim()) document.name = name.trim();
  return { id, document, updatedAt: new Date().toISOString(), dirty: true };
}

export function duplicateProject(record: LocalProject): LocalProject {
  const id = crypto.randomUUID();
  return {
    id,
    document: { ...validatedDocument(record.document), id, name: `${record.document.name} (copy)` },
    updatedAt: new Date().toISOString(),
    dirty: true,
  };
}

export function updateProject(record: LocalProject, document: ProjectDocument): LocalProject {
  const nextDocument = validatedDocument(document);
  if (record.id !== nextDocument.id) {
    throw new LibraryError("An edit cannot change the project's ID.", "invalid_project");
  }
  if (documentsEqual(record.document, nextDocument)) return record;
  return { ...record, document: nextDocument, updatedAt: new Date().toISOString(), dirty: true };
}

export function renameProject(record: LocalProject, name: string): LocalProject {
  if (!name.trim()) {
    throw new LibraryError("Give your project a name.", "invalid_project");
  }
  return updateProject(record, { ...record.document, name: name.trim() });
}

/** Fetched data must never erase unsent work or roll a cached revision back. */
export function mergeCloudProject(existing: LocalProject | undefined, cloud: CloudProject, ownerId: string): LocalProject {
  const incoming = validatedRecord({ ...cloud, dirty: false, cloud: { ownerId, revision: cloud.revision } });
  assertScope(incoming, ownerId);
  if (!existing) return incoming;
  validatedRecord(existing);
  assertScope(existing, ownerId);
  if (existing.id !== incoming.id) {
    throw new LibraryError("These projects have different IDs and cannot be merged.", "invalid_project");
  }
  if (existing.cloud && existing.cloud.revision > cloud.revision) return existing;
  const sameDocument = documentsEqual(existing.document, incoming.document);
  if (existing.dirty && !sameDocument) return existing;
  return incoming;
}
