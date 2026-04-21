import "../globals.css";
import { cn } from "@v1/ui/cn";
import { Providers } from "@/components/providers/providers";
import type { Metadata } from "next";
import { APP_DESCRIPTION, APP_NAME, getAppBaseUrl } from "@/lib/metadata";
import { getStaticParams } from "@/locales/server";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import dynamic from "next/dynamic";
import localFont from "next/font/local";
import { Suspense } from "react";

// ABC Diatype Font Family
const abcDiatype = localFont({
  src: [
    {
      path: "../../fonts/ABCDiatype-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../fonts/ABCDiatype-Medium.woff2", 
      weight: "500",
      style: "normal",
    },
    {
      path: "../../fonts/ABCDiatype-Bold.woff2",
      weight: "700", 
      style: "normal",
    },
  ],
  variable: "--font-abc-diatype",
  display: "swap",
});

// ABC Diatype Mono Font Family  
const abcDiatypeMono = localFont({
  src: [
    {
      path: "../../fonts/ABCDiatypeMono-Regular.woff2",
      weight: "400",
      style: "normal", 
    },
    {
      path: "../../fonts/ABCDiatypeMono-RegularItalic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-abc-diatype-mono",
  display: "swap", 
});

export function generateStaticParams() {
  return getStaticParams();
}

export const metadata: Metadata = {
  metadataBase: getAppBaseUrl(),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  alternates: {
    languages: {
      en: "/",
      fr: "/fr",
    },
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
};


export const viewport = {
  themeColor: "#09090b",
  colorScheme: "dark" as const,
};

const DevRuntimeDiagnostics =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@/components/dev/dev-runtime-diagnostics").then(
            (module) => module.DevRuntimeDiagnostics,
          ),
      )
    : null;

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  return (
    <html lang={locale} className="dark" data-theme="dark" style={{ colorScheme: "dark" }}>
      <head />
      <body
        className={cn(
          `${GeistSans.variable} ${GeistMono.variable} ${abcDiatype.variable} ${abcDiatypeMono.variable}`,
          "antialiased bg-zinc-950 text-white",
        )}
      >
        <Suspense fallback={null}>
          <Providers>
            {DevRuntimeDiagnostics ? (
              <DevRuntimeDiagnostics>{children}</DevRuntimeDiagnostics>
            ) : (
              children
            )}
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
