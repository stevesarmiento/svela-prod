import "./globals.css";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Provider as AnalyticsProvider } from "@v1/analytics/client";
import { cn } from "@v1/ui/cn";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { createWebLayoutMetadata } from "@/lib/metadata";

const DepartureMono = localFont({
  src: "../fonts/DepartureMono-Regular.woff2",
  variable: "--font-departure-mono",
});

const abcDiatype = localFont({
  src: [
    { path: "../../../app/src/fonts/ABCDiatype-Regular.woff2", weight: "400" },
    { path: "../../../app/src/fonts/ABCDiatype-Medium.woff2", weight: "500" },
    { path: "../../../app/src/fonts/ABCDiatype-Bold.woff2", weight: "700" },
  ],
  variable: "--font-abc-diatype",
  display: "swap",
});

const abcDiatypeMono = localFont({
  src: [
    {
      path: "../../../app/src/fonts/ABCDiatypeMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../app/src/fonts/ABCDiatypeMono-RegularItalic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-abc-diatype-mono",
  display: "swap",
});

export const metadata: Metadata = {
  ...createWebLayoutMetadata({
    description:
      "aggr.watch by Svela — focused crypto market intelligence for watchlists, screening, and clearer decisions.",
  }),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          `${DepartureMono.variable} ${GeistSans.variable} ${GeistMono.variable} ${abcDiatype.variable} ${abcDiatypeMono.variable}`,
          "antialiased dark",
        )}
      >
        <Header />
        {children}
        <Footer />

        <AnalyticsProvider />
      </body>
    </html>
  );
}
