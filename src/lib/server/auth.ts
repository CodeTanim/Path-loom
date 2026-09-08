import "server-only";

import { auth } from "@clerk/nextjs/server";

import { serviceConfiguration } from "./config";
import { HttpError } from "./http";

export { HttpError } from "./http";

export async function requireUser(): Promise<string> {
  if (!serviceConfiguration().auth) {
    throw new HttpError(503, "Sign-in is not configured yet. You can keep working locally.");
  }
  const { userId } = await auth();
  if (!userId) {
    throw new HttpError(401, "Sign in to access your cloud projects.");
  }
  return userId;
}
