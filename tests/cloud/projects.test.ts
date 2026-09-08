import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { session, query, connect } = vi.hoisted(() => ({
  session: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: session }));
vi.mock("@neondatabase/serverless", () => ({ neon: connect }));

import { checkoutProject } from "../../src/domain";
import { GET as list, POST as create } from "../../src/app/api/projects/route";
import { GET as read, PUT as update } from "../../src/app/api/projects/[id]/route";
import { requireUser } from "../../src/lib/server/auth";
import { serviceConfiguration } from "../../src/lib/server/config";
import { MAX_PROJECT_BODY_BYTES } from "../../src/lib/server/http";

const origin = "https://pathloom.example";
const owner = "user_session_owner";

function context(id = checkoutProject.id) {
  return { params: Promise.resolve({ id }) };
}

function row(revision = 1) {
  return {
    id: checkoutProject.id,
    document: structuredClone(checkoutProject),
    revision,
    updated_at: "2026-09-07T12:00:00.000Z",
  };
}

function request(
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${origin}/api/projects/${checkoutProject.id}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { origin, "content-type": "application/json", ...headers },
  });
}

function sqlText(call = 0) {
  return (query.mock.calls[call][0] as TemplateStringsArray).join("?");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "configured-for-test");
  vi.stubEnv("CLERK_SECRET_KEY", "configured-for-test");
  vi.stubEnv("DATABASE_URL", "configured-for-test");
  session.mockResolvedValue({ userId: owner });
  connect.mockReturnValue(query);
  query.mockResolvedValue([]);
});

afterEach(() => vi.unstubAllEnvs());

describe("account and cloud availability", () => {
  it("stays in guest mode without configured keys and never calls Clerk or Neon", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(serviceConfiguration()).toEqual({ auth: false, cloud: false });
    const response = await list();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(session).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("requires a verified session even when services are configured", async () => {
    session.mockResolvedValue({ userId: null });
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
    const response = await create(request("POST", { document: checkoutProject }));
    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });

  it("allows authentication but reports cloud saving unavailable without a database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(serviceConfiguration()).toEqual({ auth: true, cloud: false });
    expect(await requireUser()).toBe(owner);
    expect((await list()).status).toBe(503);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe("owner-scoped project APIs", () => {
  it("lists only the session owner's projects and returns no owner or credential metadata", async () => {
    query.mockResolvedValue([row()]);
    const response = await list();
    expect(response.status).toBe(200);
    expect(sqlText()).toContain("WHERE owner_id = ?");
    expect(query.mock.calls[0].slice(1)).toEqual([owner]);
    const body = await response.json();
    expect(body.projects[0]).toEqual({
      id: checkoutProject.id,
      document: checkoutProject,
      revision: 1,
      updatedAt: "2026-09-07T12:00:00.000Z",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  });

  it("returns 404 for another user's project without disclosing whether it exists", async () => {
    const response = await read(request("GET"), context());
    expect(response.status).toBe(404);
    expect(sqlText()).toContain("WHERE owner_id = ? AND id = ?");
    expect(query.mock.calls[0].slice(1)).toEqual([owner, checkoutProject.id]);
  });

  it("derives ownership from the session and keeps legacy document IDs stable", async () => {
    query.mockResolvedValue([row()]);
    const response = await create(request("POST", {
      document: checkoutProject,
      ownerId: "user_attacker_supplied",
    }));
    expect(response.status).toBe(201);
    expect(query.mock.calls[0].slice(1)).toEqual([
      owner,
      checkoutProject.id,
      JSON.stringify(checkoutProject),
    ]);
    expect((await response.json()).project.id).toBe(checkoutProject.id);
  });

  it("does not expose database errors to the browser", async () => {
    query.mockRejectedValue(new Error("postgres://private:password@internal.example"));
    const response = await list();
    expect(response.status).toBe(503);
    const serialized = await response.text();
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("internal.example");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("safe project mutations", () => {
  it("rejects cross-origin writes before any database call", async () => {
    const response = await create(request("POST", { document: checkoutProject }, {
      origin: "https://unrelated.example",
    }));
    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects absent origins and non-JSON bodies", async () => {
    const noOrigin = new Request(`${origin}/api/projects`, {
      method: "POST",
      body: JSON.stringify({ document: checkoutProject }),
      headers: { "content-type": "application/json" },
    });
    expect((await create(noOrigin)).status).toBe(403);
    expect((await create(request("POST", {}, { "content-type": "text/plain" }))).status).toBe(415);
    expect(query).not.toHaveBeenCalled();
  });

  it("bounds streamed request bodies even without a Content-Length header", async () => {
    const oversized = new Request(`${origin}/api/projects`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_PROJECT_BODY_BYTES + 1));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    expect((await create(oversized)).status).toBe(413);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized documents before persistence", async () => {
    expect((await create(request("POST", { document: { id: "invalid" } }))).status).toBe(400);
    expect((await create(request("POST", {
      document: { ...checkoutProject, name: "x".repeat(161) },
    }))).status).toBe(413);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a document for a different route and invalid revision tokens", async () => {
    expect((await update(request("PUT", {
      document: checkoutProject,
      revision: 1,
    }), context("different-project"))).status).toBe(400);

    for (const revision of [undefined, -1, 0, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
      expect((await update(request("PUT", {
        document: checkoutProject,
        revision,
      }), context())).status).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("updates only the session owner's expected revision and returns the new revision", async () => {
    query.mockResolvedValue([row(4)]);
    const response = await update(request("PUT", {
      document: checkoutProject,
      revision: 3,
      ownerId: "another-user",
    }), context());
    expect(response.status).toBe(200);
    expect(sqlText()).toContain("WHERE owner_id = ? AND id = ?");
    expect(sqlText()).toContain("AND revision = ?");
    expect(query.mock.calls[0].slice(1)).toEqual([
      JSON.stringify(checkoutProject), owner, checkoutProject.id, 3,
    ]);
    expect((await response.json()).project.revision).toBe(4);
  });

  it("returns a conflict for a stale revision without overwriting the newer version", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([row(4)]);
    const response = await update(request("PUT", {
      document: checkoutProject,
      revision: 2,
    }), context());
    expect(response.status).toBe(409);
    expect(query).toHaveBeenCalledTimes(2);
    expect(sqlText(1)).toContain("WHERE owner_id = ? AND id = ?");
    expect(query.mock.calls[1].slice(1)).toEqual([owner, checkoutProject.id]);
  });

  it("reports an update to another owner's ID as missing, not as a conflict", async () => {
    const response = await update(request("PUT", {
      document: checkoutProject,
      revision: 1,
    }), context());
    expect(response.status).toBe(404);
    expect(query.mock.calls[1].slice(1)).toEqual([owner, checkoutProject.id]);
  });

  it("accepts an identical create retry without incrementing revision", async () => {
    query.mockResolvedValue([row(3)]);
    const response = await create(request("POST", { document: checkoutProject }));
    expect(response.status).toBe(201);
    expect((await response.json()).project.revision).toBe(3);
    expect(sqlText()).toContain("ON CONFLICT (owner_id, id) DO UPDATE");
    expect(sqlText()).toContain("WHERE pathloom_projects.document = EXCLUDED.document");
    expect(sqlText()).not.toContain("revision = revision + 1");
  });

  it("rejects a different create document sharing an already-saved ID", async () => {
    const response = await create(request("POST", { document: checkoutProject }));
    expect(response.status).toBe(409);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
