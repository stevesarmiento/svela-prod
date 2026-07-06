// Initializes the Sentry client SDK in the browser (Next.js 15+ pattern).
// See https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
import * as Sentry from "@sentry/nextjs";

import "../sentry.client.config";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
