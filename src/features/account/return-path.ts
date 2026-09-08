/** Only app-relative destinations are allowed after authentication. */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.length > 2_048) {
    return "/";
  }
  try {
    const decoded = decodeURIComponent(value);
    const destination = new URL(value, "https://pathloom.invalid");
    if (
      decoded.startsWith("//") ||
      /[\\\u0000-\u001f\u007f]/.test(decoded) ||
      destination.origin !== "https://pathloom.invalid" ||
      /^\/sign-(in|up)(\/|$)/.test(decodeURIComponent(destination.pathname))
    ) {
      return "/";
    }
    return value;
  } catch {
    return "/";
  }
}
