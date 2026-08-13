import { Schema } from "effect";

/**
 * Shared HTTP error taxonomy for new Effect-based API services.
 *
 * Existing services (CoinGecko, CoinsInternal, CoinGlass) keep their own
 * service-specific error tags; only new services should use these.
 */

export class HttpTransportError extends Schema.TaggedError<HttpTransportError>()(
  "HttpTransportError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export class HttpStatusError extends Schema.TaggedError<HttpStatusError>()(
  "HttpStatusError",
  { endpoint: Schema.String, status: Schema.Number, message: Schema.String },
) {}

export class HttpDecodeError extends Schema.TaggedError<HttpDecodeError>()(
  "HttpDecodeError",
  { endpoint: Schema.String, message: Schema.String },
) {}

export type HttpRequestError =
  | HttpTransportError
  | HttpStatusError
  | HttpDecodeError;
