import "./src/env.mjs";
import { withSentryConfig } from "@sentry/nextjs";
import type webpack from 'webpack';

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@v1/supabase"],
  experimental: {
    optimizeCss: isProd,
    optimizePackageImports: isProd ? ["@v1/ui"] : [],
    serverActions: {
      bodySizeLimit: "2mb",
    },
    workerThreads: isProd,
    optimisticClientCache: isProd,
    turbo: {
      moduleIdStrategy: isProd ? "deterministic" : "named",
      resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    },
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
  webpack: (config: webpack.Configuration, { dev }: { dev: boolean }) => {
    if (dev) {
      config.cache = {
        type: "filesystem",
      };
    }

    config.optimization = {
      ...config.optimization,
      runtimeChunk: dev ? "single" : false,
      minimize: !dev,
      moduleIds: "deterministic",
    };

    return config;
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI || process.env.SENTRY_SUPPRESS_TURBOPACK_WARNING === "1",
  telemetry: false,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  tunnelRoute: "/monitoring",
});