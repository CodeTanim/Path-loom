import "server-only";

import type { ProjectDocument } from "../../domain/model";
import { isPathloomDocument } from "../../domain/validate";
import { HttpError, MAX_PROJECT_BODY_BYTES } from "./http";

export function validateProjectId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new HttpError(400, "The project ID is invalid.");
  }
}

export function validateCloudDocument(value: unknown): ProjectDocument {
  if (!isPathloomDocument(value)) {
    throw new HttpError(400, "This is not a valid Pathloom project.");
  }
  validateProjectId(value.id);
  if (
    value.name.length > 160 ||
    value.nodes.length > 500 ||
    value.interactions.length > 1_000 ||
    value.nodes.some((node) => node.states.length > 50) ||
    value.interactions.some((interaction) => interaction.outcomes.length > 100) ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
      MAX_PROJECT_BODY_BYTES - 128
  ) {
    throw new HttpError(413, "This project exceeds the cloud save limits.");
  }
  return value;
}

export function parseCreateProjectBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "A project document is required.");
  }
  return validateCloudDocument((body as Record<string, unknown>).document);
}

export function parseUpdateProjectBody(body: unknown, projectId: string) {
  const document = parseCreateProjectBody(body);
  const revision = (body as Record<string, unknown>).revision;
  if (document.id !== projectId) {
    throw new HttpError(400, "The document must belong to this project.");
  }
  if (
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  ) {
    throw new HttpError(400, "Include the project's last saved revision.");
  }
  return { document, revision };
}
