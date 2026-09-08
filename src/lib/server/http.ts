import "server-only";

export const MAX_PROJECT_BODY_BYTES = 1_048_576;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function privateJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie, Authorization",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return privateJson({ error: error.message }, error.status);
  }
  return privateJson(
    { error: "Cloud saving is temporarily unavailable. Your local work is safe." },
    503,
  );
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new HttpError(403, "Open Pathloom to make this change.");
  }
}

/** Read a bounded stream; Content-Length alone cannot constrain chunked bodies. */
export async function readProjectBody(request: Request): Promise<unknown> {
  requireSameOrigin(request);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) {
    throw new HttpError(415, "Send a JSON project document.");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_PROJECT_BODY_BYTES) {
    throw new HttpError(413, "This project is too large to save online.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A project document is required.");

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_PROJECT_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "This project is too large to save online.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "The project document could not be read.");
  } finally {
    reader.releaseLock();
  }
}
