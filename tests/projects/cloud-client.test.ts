import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkoutProject } from "../../src/domain";
import type { CloudProject } from "../../src/lib/cloud/types";
import type { LocalProject } from "../../src/features/projects/library";
import {
  CloudError,
  getCloudProject,
  listCloudProjects,
  projectError,
  saveCloudProject,
} from "../../src/features/projects/cloud-client";

function cloudProject(id = "project / checkout"): CloudProject {
  return {
    id,
    document: { ...structuredClone(checkoutProject), id },
    revision: 4,
    updatedAt: "2026-09-07T21:00:00.000Z",
  };
}

function localProject(existing = false): LocalProject {
  const project = cloudProject();
  return {
    id: project.id,
    document: project.document,
    updatedAt: "2026-09-07T20:00:00.000Z",
    dirty: true,
    ...(existing ? { cloud: { ownerId: "account-alice", revision: 3 } } : {}),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("cloud project reads", () => {
  it("reads validated project JSON using same-origin credentials and bypasses caches", async () => {
    const project = cloudProject();
    fetchMock.mockResolvedValueOnce(jsonResponse({ projects: [project] }));

    await expect(listCloudProjects()).resolves.toEqual([project]);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/projects", {
      cache: "no-store",
      credentials: "same-origin",
      signal: expect.any(AbortSignal),
    });
  });

  it("accepts an empty project library", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ projects: [] }));
    await expect(listCloudProjects()).resolves.toEqual([]);
  });

  it("encodes the requested project ID and validates the returned project", async () => {
    const project = cloudProject();
    fetchMock.mockResolvedValueOnce(jsonResponse({ project }));

    await expect(getCloudProject(project.id)).resolves.toEqual(project);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/projects/project%20%2F%20checkout", {
      cache: "no-store",
      credentials: "same-origin",
      signal: expect.any(AbortSignal),
    });
  });

  it("rejects a valid project belonging to a different requested ID", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ project: cloudProject("another-project") }));
    await expect(getCloudProject("requested-project")).rejects.toMatchObject({
      name: "CloudError",
      status: 502,
      message: expect.stringMatching(/different project/i),
    });
  });

  it.each([null, {}, { projects: {} }, { projects: "not an array" }])(
    "rejects malformed project list envelopes: %j",
    async (body) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(body));
      await expect(listCloudProjects()).rejects.toMatchObject({ name: "CloudError", status: 502 });
    },
  );

  it.each([
    { label: "missing document", change: { document: null } },
    { label: "invalid document", change: { document: { schemaVersion: 2 } } },
    { label: "mismatched ID", change: { id: "other-project" } },
    { label: "zero revision", change: { revision: 0 } },
    { label: "fractional revision", change: { revision: 1.5 } },
    { label: "string revision", change: { revision: "4" } },
    { label: "unsafe revision", change: { revision: Number.MAX_SAFE_INTEGER + 1 } },
    { label: "invalid date", change: { updatedAt: "yesterday" } },
    { label: "missing date", change: { updatedAt: null } },
  ])("rejects a project with $label in single and list responses", async ({ change }) => {
    const invalid = { ...cloudProject(), ...change };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ project: invalid }))
      .mockResolvedValueOnce(jsonResponse({ projects: [cloudProject(), invalid] }));

    await expect(getCloudProject(cloudProject().id)).rejects.toMatchObject({ name: "CloudError", status: 502 });
    await expect(listCloudProjects()).rejects.toMatchObject({ name: "CloudError", status: 502 });
  });

  it("rejects missing single-project data instead of returning an empty object", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(getCloudProject("missing")).rejects.toBeInstanceOf(CloudError);
  });
});

describe("cloud project writes", () => {
  it("creates a guest draft with POST, JSON content type, and no account or revision in the body", async () => {
    const record = localProject();
    const original = structuredClone(record);
    const saved = cloudProject();
    fetchMock.mockResolvedValueOnce(jsonResponse({ project: saved }, 201));

    await expect(saveCloudProject(record)).resolves.toEqual(saved);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: record.document }),
      cache: "no-store",
      credentials: "same-origin",
      signal: expect.any(AbortSignal),
    });
    expect(record).toEqual(original);
  });

  it("updates an existing project with PUT and its base revision for conflict detection", async () => {
    const record = localProject(true);
    const original = structuredClone(record);
    const saved = cloudProject();
    fetchMock.mockResolvedValueOnce(jsonResponse({ project: saved }));

    await expect(saveCloudProject(record)).resolves.toEqual(saved);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/projects/project%20%2F%20checkout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: record.document, revision: 3 }),
      cache: "no-store",
      credentials: "same-origin",
      signal: expect.any(AbortSignal),
    });
    expect(record).toEqual(original);
  });

  it.each([false, true])("rejects another project's save response (existing=%s)", async (existing) => {
    const record = localProject(existing);
    fetchMock.mockResolvedValueOnce(jsonResponse({ project: cloudProject("wrong-project") }));
    await expect(saveCloudProject(record)).rejects.toMatchObject({ name: "CloudError", status: 502 });
    expect(record.dirty).toBe(true);
  });

  it("rejects malformed save data and leaves the pending local version unchanged", async () => {
    const record = localProject(true);
    const original = structuredClone(record);
    fetchMock.mockResolvedValueOnce(jsonResponse({ project: { id: record.id } }));
    await expect(saveCloudProject(record)).rejects.toMatchObject({ name: "CloudError", status: 502 });
    expect(record).toEqual(original);
  });

  it("preserves a revision conflict as a 409 error without retrying the write", async () => {
    const record = localProject(true);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "This flow was changed on another device." }, 409));

    await expect(saveCloudProject(record)).rejects.toMatchObject({
      status: 409,
      message: "This flow was changed on another device.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(record.cloud?.revision).toBe(3);
    expect(record.dirty).toBe(true);
  });
});

describe("cloud request failures", () => {
  it.each([401, 403])("preserves authentication/authorization status %s and the server message", async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Sign in to view your flows." }, status));
    await expect(listCloudProjects()).rejects.toMatchObject({
      name: "CloudError",
      status,
      message: "Sign in to view your flows.",
    });
  });

  it("reports a network failure without implying that the browser copy was removed", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(listCloudProjects()).rejects.toMatchObject({
      name: "CloudError",
      status: 0,
      message: expect.stringMatching(/browser copy is still available/i),
    });
  });

  it("aborts a stalled request after the configured timeout and keeps the local version pending", async () => {
    const record = localProject(true);
    const original = structuredClone(record);
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    fetchMock.mockImplementationOnce((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));

    const request = saveCloudProject(record);
    expect(timeoutSpy).toHaveBeenCalledExactlyOnceWith(15_000);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
    controller.abort(new DOMException("The request timed out.", "TimeoutError"));

    await expect(request).rejects.toMatchObject({
      name: "CloudError",
      status: 0,
      message: expect.stringMatching(/browser copy is still available/i),
    });
    expect(record).toEqual(original);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses a readable error when an unavailable server returns HTML", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 503 }));
    await expect(listCloudProjects()).rejects.toMatchObject({
      name: "CloudError",
      status: 503,
      message: "Cloud storage is unavailable. Please retry.",
    });
  });

  it("rejects a success status with invalid JSON as an invalid API response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    await expect(listCloudProjects()).rejects.toMatchObject({ name: "CloudError", status: 502 });
  });

  it("does not display non-string server errors as user messages", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { internal: "details" } }, 500));
    await expect(listCloudProjects()).rejects.toMatchObject({
      status: 500,
      message: "Cloud storage is unavailable. Please retry.",
    });
  });

  it("formats known and unknown failures for the project UI", () => {
    expect(projectError(new CloudError("Sign in again.", 401))).toBe("Sign in again.");
    expect(projectError("unexpected")).toMatch(/saved projects have not been removed/i);
  });
});
