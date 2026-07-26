import type { ReadonlyURLSearchParams } from "next/navigation";

const DEFAULT_REDIRECT_URL = "/watchlists";

function isSafeRelativePath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;

  try {
    const parsed = new URL(value, "https://svela.local");
    return parsed.origin === "https://svela.local";
  } catch {
    return false;
  }
}

export function getRedirectUrlComplete(searchParams: ReadonlyURLSearchParams): string {
  // react-doctor-disable-next-line react-doctor/url-prefilled-privileged-action -- value passes isSafeRelativePath (same-origin relative only) with hardcoded fallback
  const next = searchParams.get("next")?.trim();
  if (!next || !isSafeRelativePath(next)) return DEFAULT_REDIRECT_URL;
  return next;
}
