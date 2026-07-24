import type { Metadata } from "next";

const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = ["en", "fr"] as const;

export const APP_NAME = "aggr.watch";
export const APP_DESCRIPTION =
  "Aggressively watching markets until the moment clarity shows up and you're ready to act.";

export interface CreateMetadataOptions {
  title: string;
  description?: string;
  pathname?: string;
  locale?: string;
  image?: string;
  robots?: Metadata["robots"];
}

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function stripSupportedLocalePrefix(pathname: string): string {
  const normalized = normalizePathname(pathname);
  for (const supported of SUPPORTED_LOCALES) {
    if (normalized === `/${supported}`) return "/";
    if (normalized.startsWith(`/${supported}/`)) return normalized.slice(supported.length + 1);
  }
  return normalized;
}

function getLocalhostBaseUrl(): URL {
  const port = process.env.PORT ?? "3000";
  const candidate = `http://localhost:${port}`;
  return URL.canParse(candidate) ? new URL(candidate) : new URL("http://localhost:3000");
}

export function getAppBaseUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) {
    if (URL.canParse(explicit)) return new URL(explicit);
  }

  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    const candidate = vercel.startsWith("http") ? vercel : `https://${vercel}`;
    if (URL.canParse(candidate)) return new URL(candidate);
  }

  return getLocalhostBaseUrl();
}

function prefixLocale(pathname: string, locale: string): string {
  const normalized = normalizePathname(pathname);
  if (!locale || locale === DEFAULT_LOCALE) return normalized;
  return `/${locale}${normalized === "/" ? "" : normalized}`;
}

export function getAlternatesForPathname(pathname: string): NonNullable<Metadata["alternates"]> {
  const basePath = stripSupportedLocalePrefix(pathname);
  return {
    languages: {
      en: basePath,
      fr: `/fr${basePath === "/" ? "" : basePath}`,
    },
  };
}

export function createMetadata(options: CreateMetadataOptions): Metadata {
  const {
    title,
    description = APP_DESCRIPTION,
    pathname,
    locale,
    image,
    robots,
  } = options;

  const metadataBase = getAppBaseUrl();
  const basePathname = pathname ? stripSupportedLocalePrefix(pathname) : undefined;
  const canonicalPathname = basePathname ? prefixLocale(basePathname, locale ?? DEFAULT_LOCALE) : undefined;

  const images = image ? [{ url: image }] : undefined;

  return {
    metadataBase,
    title,
    description,
    alternates: basePathname
      ? {
          canonical: canonicalPathname,
          ...getAlternatesForPathname(basePathname),
        }
      : undefined,
    openGraph: {
      type: "website",
      siteName: APP_NAME,
      title,
      description,
      locale: locale && SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number]) ? locale : DEFAULT_LOCALE,
      url: canonicalPathname ? new URL(canonicalPathname, metadataBase).toString() : undefined,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      images: images?.map((img) => img.url),
    },
    robots,
  };
}

