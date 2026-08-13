import { Schema } from "effect";

/**
 * Shared error taxonomy for the server-side Effect layer.
 *
 * One generic family (not per-vendor) so the route adapter can map
 * tags to HTTP statuses uniformly; `vendor` carries the origin.
 */

export class UpstreamHttpError extends Schema.TaggedError<UpstreamHttpError>()(
  "UpstreamHttpError",
  {
    vendor: Schema.String,
    endpoint: Schema.String,
    status: Schema.Number,
    message: Schema.String,
  },
) {}

export class UpstreamRateLimitedError extends Schema.TaggedError<UpstreamRateLimitedError>()(
  "UpstreamRateLimitedError",
  { vendor: Schema.String, endpoint: Schema.String, message: Schema.String },
) {}

export class UpstreamAuthError extends Schema.TaggedError<UpstreamAuthError>()(
  "UpstreamAuthError",
  { vendor: Schema.String, endpoint: Schema.String, message: Schema.String },
) {}

export class UpstreamTimeoutError extends Schema.TaggedError<UpstreamTimeoutError>()(
  "UpstreamTimeoutError",
  { vendor: Schema.String, endpoint: Schema.String },
) {}

export class UpstreamDecodeError extends Schema.TaggedError<UpstreamDecodeError>()(
  "UpstreamDecodeError",
  { vendor: Schema.String, endpoint: Schema.String, message: Schema.String },
) {}

export class MissingApiKeyError extends Schema.TaggedError<MissingApiKeyError>()(
  "MissingApiKeyError",
  { vendor: Schema.String },
) {}

export class RequestValidationError extends Schema.TaggedError<RequestValidationError>()(
  "RequestValidationError",
  { message: Schema.String },
) {}

export class ConvexTimeoutError extends Schema.TaggedError<ConvexTimeoutError>()(
  "ConvexTimeoutError",
  { label: Schema.String },
) {}

export class ConvexQueryError extends Schema.TaggedError<ConvexQueryError>()(
  "ConvexQueryError",
  { label: Schema.String, message: Schema.String },
) {}

export type UpstreamErrors =
  | UpstreamHttpError
  | UpstreamRateLimitedError
  | UpstreamAuthError
  | UpstreamTimeoutError
  | UpstreamDecodeError;

export type RouteErrors =
  | UpstreamErrors
  | MissingApiKeyError
  | RequestValidationError
  | ConvexTimeoutError
  | ConvexQueryError;
