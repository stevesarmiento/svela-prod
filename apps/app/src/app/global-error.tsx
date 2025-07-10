"use client";

// import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    // Temporarily disabled to fix DataCloneError
    // Sentry.captureException(error);
    console.error("Global error:", error);
  }, [error]);

  return <NextError statusCode={0} />;
}
