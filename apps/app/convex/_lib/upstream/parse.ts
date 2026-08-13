/**
 * Schema-based parsing for upstream API payloads.
 *
 * Envelope-level shape drift throws UpstreamValidationError (greppable
 * separately from transport failures / UpstreamHttpError); malformed
 * individual rows/points are handled at call sites via safeParse-and-skip,
 * matching the pre-schema per-row tolerance.
 */

import type { z } from "zod";
import { UpstreamValidationError } from "../upstreamFetch";

const MAX_ISSUES = 3;
const SUMMARY_MAX_LENGTH = 300;

export function parseUpstream<S extends z.ZodTypeAny>(args: {
  source: string;
  schema: S;
  value: unknown;
}): z.infer<S> {
  const parsed = args.schema.safeParse(args.value);
  if (parsed.success) return parsed.data;

  const summary = parsed.error.issues
    .slice(0, MAX_ISSUES)
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ")
    .slice(0, SUMMARY_MAX_LENGTH);

  throw new UpstreamValidationError({ source: args.source, summary });
}
