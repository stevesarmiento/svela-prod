import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import { convex, getServerToken } from "@/lib/convex-server";

const OHLCParamsSchema = z.object({
  id: z.string(),
  vs_currency: z.string().optional().default("usd"),
  days: z
    .enum(["1", "7", "14", "30", "90", "180", "365", "1825", "max"])
    .optional()
    .default("7"),
  precision: z.string().optional().nullable(),
})

export interface OHLCDataPoint {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

export async function GET(request: NextRequest) {
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url)

  const params = OHLCParamsSchema.safeParse({
    id: searchParams.get("id"),
    vs_currency: searchParams.get("vs_currency"),
    days: searchParams.get("days"),
    precision: searchParams.get("precision"),
  })

  if (!params.success) {
    return NextResponse.json({ error: "Invalid parameters", details: params.error.issues }, { status: 400 })
  }

  const { id: coinId, vs_currency, days } = params.data;

  if (vs_currency.toLowerCase() !== "usd") {
    return NextResponse.json(
      { error: "Only vs_currency=usd is supported", data: [] },
      { status: 400 },
    );
  }

  const series = await convex.query(api.coingeckoReads.getPriceHistorySeries, {
    serverToken: getServerToken(),
    coingeckoId: coinId,
    timeframe: `${days}_ohlc`,
  });

  const transformedData: Array<OHLCDataPoint> = series.data.map((point) => {
    const close = point.close ?? point.price;
    return {
      timestamp: point.timestamp,
      open: point.open ?? close,
      high: point.high ?? close,
      low: point.low ?? close,
      close,
    };
  });

  return NextResponse.json(
    {
      data: transformedData,
      cached: true,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}