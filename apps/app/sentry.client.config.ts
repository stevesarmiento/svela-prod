import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // 10% transaction sampling: 100% on a chart-heavy dashboard burns
  // Sentry quota with little added signal. Errors are always captured.
  tracesSampleRate: 0.1,
  debug: false,
  enabled: process.env.NODE_ENV === "production",
  // browserTracing gives us pageload/navigation spans + Web Vitals
  // (LCP/INP/CLS) at the 10% sample rate above. Router transitions are
  // already wired via onRouterTransitionStart in instrumentation-client.
  // Replay is deliberately omitted: it adds ~50KB gzip to every load.
  integrations: [Sentry.browserTracingIntegration()],
});
