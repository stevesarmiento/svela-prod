import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  // 10% transaction sampling: 100% on a chart-heavy dashboard burns
  // Sentry quota with little added signal. Errors are always captured.
  tracesSampleRate: 0.1,
  debug: false,
});
