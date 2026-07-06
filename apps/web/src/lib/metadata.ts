import type { Metadata } from "next";

export const WEB_NAME = "Svela";

export interface CreateWebLayoutMetadataOptions {
  description?: string;
}

export interface CreateWebPageMetadataOptions {
  title: string;
  description?: string;
  pathname?: string;
  image?: string;
  robots?: Metadata["robots"];
}

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function getLocalhostBaseUrl(): URL {
  const port = process.env.PORT ?? "3000";
  return new URL(`http://localhost:${port}`);
}

export function getWebBaseUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_WEB_URL;
  if (explicit) return new URL(explicit);

  const vercel = process.env.VERCEL_URL;
  if (vercel) return new URL(vercel.startsWith("http") ? vercel : `https://${vercel}`);

  return getLocalhostBaseUrl();
}

export function createWebLayoutMetadata(options: CreateWebLayoutMetadataOptions): Metadata {
  const metadataBase = getWebBaseUrl();
  return {
    metadataBase,
    title: {
      default: WEB_NAME,
      template: `%s · ${WEB_NAME}`,
    },
    description: options.description,
    openGraph: {
      type: "website",
      siteName: WEB_NAME,
      title: WEB_NAME,
      description: options.description,
    },
    twitter: {
      card: "summary",
      title: WEB_NAME,
      description: options.description,
    },
  };
}

export function createWebPageMetadata(options: CreateWebPageMetadataOptions): Metadata {
  const { title, description, pathname, image, robots } = options;

  const metadataBase = getWebBaseUrl();
  const resolvedPathname = pathname ? normalizePathname(pathname) : undefined;
  const images = image ? [{ url: image }] : undefined;

  return {
    title,
    description,
    alternates: resolvedPathname
      ? {
          canonical: resolvedPathname,
        }
      : undefined,
    openGraph: {
      type: "website",
      siteName: WEB_NAME,
      title,
      description,
      url: resolvedPathname ? new URL(resolvedPathname, metadataBase).toString() : undefined,
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

