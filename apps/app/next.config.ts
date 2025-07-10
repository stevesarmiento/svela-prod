import "./src/env.mjs";
//import { withSentryConfig } from "@sentry/nextjs";
/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [],
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