import { Context, Effect, Layer, Schema } from "effect";

import { requestJson } from "./http-request";

export type OverviewBriefCardKind =
  | "top_gainer"
  | "top_loser"
  | "events"
  | "regime"
  | "technicals"
  | "theme";

export type OverviewBriefCardTone = "positive" | "negative" | "neutral";

export interface OverviewBriefCard {
  kind: OverviewBriefCardKind;
  title: string;
  primary: string;
  secondary: string | null;
  body: string;
  tone: OverviewBriefCardTone;
  details?: unknown;
}

export interface OverviewDailyBrief {
  summary: string;
  headline: string;
  bullets: string[];
  risks: string[];
  opportunities: string[];
  cards: OverviewBriefCard[];
  generatedAt: number;
  model: string | null;
}

const OverviewBriefCardSchema = Schema.Struct({
  kind: Schema.Literals([
    "top_gainer",
    "top_loser",
    "events",
    "regime",
    "technicals",
    "theme",
  ]),
  title: Schema.String,
  primary: Schema.String,
  secondary: Schema.NullOr(Schema.String),
  body: Schema.String,
  tone: Schema.Literals(["positive", "negative", "neutral"]),
  details: Schema.optional(Schema.Unknown),
});

const OverviewDailyBriefSchema = Schema.Struct({
  summary: Schema.String,
  headline: Schema.String,
  bullets: Schema.Array(Schema.String),
  risks: Schema.Array(Schema.String),
  opportunities: Schema.Array(Schema.String),
  cards: Schema.Array(OverviewBriefCardSchema),
  generatedAt: Schema.Number,
  model: Schema.NullOr(Schema.String),
});

// Brief generation runs an LLM pass server-side; give it plenty of room.
const DAILY_BRIEF_TIMEOUT_MS = 90_000;

// biome-ignore lint/complexity/noStaticOnlyClass: Effect v4 service class — the class is the Context tag; `layer` must be static
export class OverviewApi extends Context.Service<OverviewApi>()("OverviewApi", {
  make: Effect.gen(function* () {
    const generateDailyBrief = Effect.fn("OverviewApi.generateDailyBrief")(
      function* (args: { force?: boolean }) {
        return yield* requestJson({
          endpoint: "/api/overview/daily-brief",
          decode: (data): OverviewDailyBrief =>
            // Fresh JSON — safe to treat decoded readonly arrays as mutable.
            Schema.decodeUnknownSync(OverviewDailyBriefSchema)(
              data,
            ) as OverviewDailyBrief,
          init: {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ force: args.force }),
          },
          timeoutMs: DAILY_BRIEF_TIMEOUT_MS,
        });
      },
    );

    return { generateDailyBrief } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
