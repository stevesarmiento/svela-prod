import "./src/env.mjs";
//import { withSentryConfig } from "@sentry/nextjs";
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
    optimizePackageImports: isProd ? ["@v1/ui"] : [],
    serverActions: {
      bodySizeLimit: "2mb",
    },
    optimisticClientCache: isProd,
  },
  compiler: {
    removeConsole: isProd,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    minimumCacheTTL: 31536000,
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

// export default withSentryConfig(nextConfig, {
//   silent: !process.env.CI || process.env.SENTRY_SUPPRESS_TURBOPACK_WARNING === "1",
//   telemetry: false,
//   widenClientFileUpload: true,
//   hideSourceMaps: true,
//   disableLogger: true,
//   tunnelRoute: "/monitoring",
// });

export default nextConfig;