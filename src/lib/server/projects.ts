import "server-only";

import type { ProjectDocument } from "../../domain/model";
import type { CloudProject } from "../cloud/types";
import { getDatabase } from "./database";
import { HttpError } from "./http";

type ProjectRow = {
  id: string;
  document: ProjectDocument;
  revision: number;
  updated_at: string | Date;
};

function toProject(row: ProjectRow): CloudProject {
  return {
    id: row.id,
    document: row.document,
    revision: row.revision,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listProjects(ownerId: string): Promise<CloudProject[]> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT id, document, revision, updated_at
    FROM pathloom_projects
    WHERE owner_id = ${ownerId}
    ORDER BY updated_at DESC, id ASC
  `;
  return (rows as ProjectRow[]).map(toProject);
}

export async function getProject(ownerId: string, projectId: string) {
  const sql = getDatabase();
  const rows = await sql`
    SELECT id, document, revision, updated_at
    FROM pathloom_projects
    WHERE owner_id = ${ownerId} AND id = ${projectId}
  `;
  if (!rows[0]) throw new HttpError(404, "This cloud project was not found.");
  return toProject(rows[0] as ProjectRow);
}

export async function createProject(ownerId: string, document: ProjectDocument) {
  const sql = getDatabase();
  // An identical retry returns the same revision; a different document never
  // overwrites an existing cloud project just because it shares the same ID.
  const rows = await sql`
    INSERT INTO pathloom_projects (owner_id, id, document)
    VALUES (${ownerId}, ${document.id}, ${JSON.stringify(document)}::jsonb)
    ON CONFLICT (owner_id, id) DO UPDATE
    SET document = pathloom_projects.document
    WHERE pathloom_projects.document = EXCLUDED.document
    RETURNING id, document, revision, updated_at
  `;
  if (!rows[0]) {
    throw new HttpError(409, "A different version of this project is already saved online. Open the cloud version or save a copy.");
  }
  return toProject(rows[0] as ProjectRow);
}

export async function updateProject(
  ownerId: string,
  projectId: string,
  document: ProjectDocument,
  revision: number,
) {
  const sql = getDatabase();
  const rows = await sql`
    UPDATE pathloom_projects
    SET document = ${JSON.stringify(document)}::jsonb,
        revision = revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE owner_id = ${ownerId} AND id = ${projectId}
      AND revision = ${revision}
    RETURNING id, document, revision, updated_at
  `;
  if (!rows[0]) {
    // Scope the existence check identically so another user's ID is never
    // distinguishable from a project that does not exist.
    await getProject(ownerId, projectId);
    throw new HttpError(409, "This project changed in another session. Open the cloud version or save your changes as a copy.");
  }
  return toProject(rows[0] as ProjectRow);
}
