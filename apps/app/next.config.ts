import "./src/env.mjs";
import { withSentryConfig } from "@sentry/nextjs";
/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@solana/design-system"],
  async redirects() {
    return [
      // Back-compat: `/:locale/charts` used to be the screener entry point.
      {
        source: "/:locale/charts",
        destination: "/:locale/screener",
        permanent: true,
      },
      // Back-compat: non-locale charts entry.
      {
        source: "/charts",
        destination: "/screener",
        permanent: true,
      },
    ];
  },
  experimental: {
    //optimizeCss: isProd,
    // Unconditional: symbols-react's barrel re-exports 6k+ modules, and
    // optimizing it matters *most* in dev (cold compile + HMR graph size).
    optimizePackageImports: ["@v1/ui", "symbols-react"],
    serverActions: {
      bodySizeLimit: "2mb",
    },
    optimisticClientCache: isProd,
  },
  compiler: {
    removeConsole: isProd,
  },
  images: {
    // Known logo/avatar CDNs only — a "**" wildcard turns the image
    // optimizer into an open proxy. Arbitrary wallet-token logos render
    // with `unoptimized` instead (see add-wallet-dialog).
    remotePatterns: [
      { protocol: "https" as const, hostname: "coin-images.coingecko.com" },
      { protocol: "https" as const, hostname: "assets.coingecko.com" },
      { protocol: "https" as const, hostname: "s2.coinmarketcap.com" },
      { protocol: "https" as const, hostname: "img.clerk.com" },
    ],
    // TokenLogo renders at quality 70; Next only allows [75] unless listed.
    qualities: [70, 75],
    minimumCacheTTL: 31536000,
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

// Source-map upload is a no-op when SENTRY_AUTH_TOKEN is absent (local
// builds); CI provides SENTRY_AUTH_TOKEN/ORG/PROJECT via turbo.json env.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI || process.env.SENTRY_SUPPRESS_TURBOPACK_WARNING === "1",
  telemetry: false,
  widenClientFileUpload: true,
  // v10 replacement for the removed `hideSourceMaps`: upload maps, then
  // strip them from the deployed output.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  disableLogger: true,
  // First-party ingest path so ad blockers don't blind error/RUM reporting.
  tunnelRoute: "/monitoring",
});