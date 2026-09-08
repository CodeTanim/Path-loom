import { parsePathloomDocument } from "../../domain/validate";
import type { CloudProject } from "@/lib/cloud/types";
import type { LocalProject } from "./library";

export class CloudError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "CloudError";
  }
}

function parseProject(value: unknown): CloudProject {
  if (!value || typeof value !== "object") throw new CloudError("The server returned an invalid project.", 502);
  const project = value as Record<string, unknown>;
  const document = parsePathloomDocument(JSON.stringify(project.document));
  if (!document || project.id !== document.id || typeof project.revision !== "number" ||
    !Number.isSafeInteger(project.revision) || project.revision < 1 ||
    typeof project.updatedAt !== "string" || !Number.isFinite(Date.parse(project.updatedAt))) {
    throw new CloudError("The server returned an invalid project. Your browser copy is unchanged.", 502);
  }
  return { id: document.id, document, revision: project.revision, updatedAt: project.updatedAt };
}

async function request(path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, { ...init, cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new CloudError("Could not reach cloud storage. Your browser copy is still available. Check your connection and retry.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CloudError(typeof data?.error === "string" ? data.error : "Cloud storage is unavailable. Please retry.", response.status);
  }
  return data;
}

export async function listCloudProjects(): Promise<CloudProject[]> {
  const data = await request("/api/projects");
  if (!Array.isArray(data?.projects)) throw new CloudError("The server returned an invalid project list.", 502);
  return data.projects.map(parseProject);
}

export async function getCloudProject(id: string): Promise<CloudProject> {
  const data = await request(`/api/projects/${encodeURIComponent(id)}`);
  const project = parseProject(data?.project);
  if (project.id !== id) throw new CloudError("The server returned a different project.", 502);
  return project;
}

export async function saveCloudProject(record: LocalProject): Promise<CloudProject> {
  const existing = Boolean(record.cloud);
  const data = await request(existing ? `/api/projects/${encodeURIComponent(record.id)}` : "/api/projects", {
    method: existing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document: record.document, ...(existing ? { revision: record.cloud!.revision } : {}) }),
  });
  const project = parseProject(data?.project);
  if (project.id !== record.id) throw new CloudError("The server returned a different project. Your browser copy is unchanged.", 502);
  return project;
}

export function projectError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Your saved projects have not been removed.";
}
