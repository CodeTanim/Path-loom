import type { CloudProject } from "../../lib/cloud/types";
import { documentsEqual, LibraryError, mergeCloudProject, type LocalProject } from "./library";

/** A save can finish after more edits; only the version actually sent is saved. */
export function acknowledgeCloudSave(
  current: LocalProject,
  sent: LocalProject,
  cloud: CloudProject,
  ownerId: string,
): LocalProject {
  if (
    current.id !== sent.id ||
    sent.id !== cloud.id ||
    current.document.id !== current.id ||
    sent.document.id !== sent.id
  ) {
    throw new LibraryError("The save response belongs to a different project.", "invalid_project");
  }
  if (
    (current.cloud && current.cloud.ownerId !== ownerId) ||
    (sent.cloud && sent.cloud.ownerId !== ownerId)
  ) {
    throw new LibraryError("The save response belongs to a different account.", "wrong_account");
  }
  if (!documentsEqual(cloud.document, sent.document)) {
    throw new LibraryError("The saved version does not match the project that was sent.", "invalid_project");
  }

  const saved = mergeCloudProject(undefined, cloud, ownerId);
  // Multiple requests may resolve in a different order. Never move the cloud
  // base backwards or acknowledge edits using an obsolete response.
  if (current.cloud && current.cloud.revision > cloud.revision) return current;
  const hasNewEdits = !documentsEqual(current.document, sent.document);
  return {
    ...current,
    cloud: saved.cloud,
    dirty: hasNewEdits,
    updatedAt: hasNewEdits ? current.updatedAt : cloud.updatedAt,
  };
}

/** Retained guest backups never hide the account's current cached version. */
export function combineProjects(guest: LocalProject[], account: LocalProject[]): LocalProject[] {
  const combined = new Map<string, LocalProject>();
  for (const group of [guest, account]) {
    const latest = new Map<string, LocalProject>();
    for (const project of group) {
      const previous = latest.get(project.id);
      if (!previous || Date.parse(project.updatedAt) > Date.parse(previous.updatedAt)) {
        latest.set(project.id, project);
      }
    }
    for (const [id, project] of latest) combined.set(id, project);
  }
  return [...combined.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
