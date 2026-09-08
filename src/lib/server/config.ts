import "server-only";

/** Expose availability, never credentials, to the application shell. */
export function serviceConfiguration() {
  const auth = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim(),
  );

  return {
    auth,
    cloud: auth && Boolean(process.env.DATABASE_URL?.trim()),
  };
}
