import "server-only";

import { neon } from "@neondatabase/serverless";

import { serviceConfiguration } from "./config";
import { HttpError } from "./http";

export function getDatabase() {
  if (!serviceConfiguration().cloud) {
    throw new HttpError(503, "Cloud saving is not configured yet. Your projects stay on this device.");
  }
  // Initialize only during a request so guest mode and builds need no secrets.
  return neon(process.env.DATABASE_URL!);
}
