import { describe, expect, it } from "vitest";

import { safeReturnPath } from "../../src/features/account/return-path";

describe("safe authentication return paths", () => {
  it("preserves a relative editor route", () => {
    expect(safeReturnPath("/projects/checkout?source=guest")).toBe(
      "/projects/checkout?source=guest",
    );
  });

  it.each([
    undefined,
    ["/projects/a"],
    "https://unrelated.example",
    "//unrelated.example",
    "/%2funrelated.example",
    "/\\unrelated.example",
    "/%5cunrelated.example",
    "/projects/a%0d%0aLocation:https://unrelated.example",
    "/sign-in",
    "/sign-up/verify",
    "/projects/../sign-in",
    "/%",
  ])("rejects unsafe or looping destination %s", (value) => {
    expect(safeReturnPath(value)).toBe("/");
  });
});
