import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { serviceConfiguration } from "./lib/server/config";

const configuredProxy = clerkMiddleware();

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!serviceConfiguration().auth) return NextResponse.next();
  return configuredProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
