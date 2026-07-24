/**
 * Extract a human-readable message from a Clerk API error, falling back to a
 * provided default. Clerk errors carry an `errors` array with
 * `longMessage`/`message` entries.
 */
export function getClerkErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "errors" in error) {
    const errors = (
      error as { errors?: Array<{ longMessage?: string; message?: string }> }
    ).errors;
    const first = errors?.[0];
    if (first?.longMessage || first?.message) {
      return first.longMessage ?? first.message ?? fallback;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
