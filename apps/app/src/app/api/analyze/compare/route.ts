import { streamText } from 'ai'
import type { NextRequest } from 'next/server'
import { withAuthRatelimit } from '@/lib/api/with-auth-ratelimit'
import { z } from 'zod'
import { gemini } from '@/lib/gemini'
import { IndicatorDataSchema, formatIndicatorAnalysis } from '@/lib/analyze-shared'
import {
  ComparativeStatsSchema,
  formatComparativeStats,
} from '@/lib/comparative-stats'

const CompareRequestSchema = z.object({
  tokens: z.array(IndicatorDataSchema).min(2).max(5),
  /** Precomputed client-side cross-asset stats (correlation, beta, vol). */
  comparative: ComparativeStatsSchema.optional(),
})

export const POST = withAuthRatelimit(
  async (req: NextRequest) => {
    return handleCompare(req)
  },
  { name: 'analyze-compare', requireAuth: true, limiter: 'llm' },
)

async function handleCompare(req: Request) {
  try {
    const rawData = await req.text()
    let data: unknown

    try {
      const parsed = JSON.parse(rawData)
      // useCompletion wraps the body as {prompt: "<json string>"}.
      data = parsed.prompt ? JSON.parse(parsed.prompt) : parsed
    } catch (e) {
      console.error('JSON parse error:', e)
      return new Response(JSON.stringify({ error: 'Invalid JSON data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { tokens, comparative } = CompareRequestSchema.parse(data)

    const symbols = tokens.map((t) => t.symbol.toUpperCase()).join(', ')
    const benchmarkSymbol =
      comparative?.benchmarkSymbol.toUpperCase() ??
      tokens[0]!.symbol.toUpperCase()
    const perAssetBlocks = tokens
      .map(
        (t, i) =>
          `### ASSET ${i + 1}: ${t.name} (${t.symbol.toUpperCase()})\n${formatIndicatorAnalysis(t)}`,
      )
      .join('\n\n---\n\n')

    const comparativeBlock = comparative
      ? `
    **PRECOMPUTED CROSS-ASSET STATISTICS (ground truth — computed from the raw daily series, do NOT recompute or second-guess these):**
    ${formatComparativeStats(comparative)}
    `
      : ''

    const prompt = `
    You are a sharp cross-asset analyst in digital asset markets. You are given ${tokens.length} assets someone holds or is watching together, plus precomputed statistics about how they've actually been moving. Your job is to tell the reader something worth knowing about how these assets relate — the interesting stuff a chart-watcher would miss — and what, if anything, is actionable about it. You are concise, opinionated when the data supports it, and never verbose.

    **DATA SPECIFICATION:**
    - **TIME INTERVAL**: Each data point = 1 DAY (24-hour periods)
    - **MOMENTUM ANALYSIS**: 7-day current vs 7-day previous averages (when ≥14 points are provided)
    - **SUPPORT/RESISTANCE**: 21-day extremes (when ≥21 points are provided)
    - Correlation/beta/volatility below are PRECOMPUTED from the daily return series — treat them as exact. Never estimate your own correlation or beta figures.
    - **NEVER HALLUCINATE** numbers beyond what's provided.

    **ASSETS (${tokens.length}):** ${symbols}
    **REFERENCE ASSET:** ${benchmarkSymbol} — beta and excess-return figures are computed relative to it. This is context, NOT a required lens: use beta when it illuminates, ignore it when another angle tells the better story.
    ${comparativeBlock}
    **CURRENT MARKET STATE PER ASSET (30d daily context):**
    ${perAssetBlocks}

    How to think about this:
    - The statistics are evidence, not an outline. Pick whichever lenses make the real story clearest:
      correlation regimes, relative momentum, flow/OI disagreements, volatility asymmetry, divergences,
      one asset basing while another overheats, a pair that "should" co-move but isn't (or vice versa).
    - Lead with the most interesting thing in the data. Do not narrate every stat.
    - Compare — no standalone single-asset write-ups.
    - Some per-asset labels (e.g. priceAction trend, momentum tags) are derived from short windows and
      can disagree with the longer-horizon returns (a 24h bounce inside a weekly downtrend). Resolve
      such conflicts yourself using the longer-horizon series — never spend a standout observation on
      a labeling inconsistency in the provided data; at most note it in half a sentence.
    - The indicator posture table (Wave Trend, Money Flow, RSI-BB %B, BBWP) is prime cross-asset
      material: a Wave Trend cross on one asset but not another, money flowing into one while out of
      the other, or one asset in a BBWP squeeze (≤20, expansion likely) while another is at an
      expansion climax (≥80) are exactly the kind of disagreements worth surfacing — when they line
      up with the returns/flow evidence.

    Structure the report as:

    **The Read**
    3-5 sentences: how these assets are actually moving together right now, in plain terms. Cohesive
    bloc, one leader dragging the rest, or genuinely independent stories? Cite the key numbers that
    justify the read.

    **What Stands Out**
    2-4 observations, most interesting first. For each: the evidence (exact figures from the data),
    why it's notable or atypical for these assets, and how confident the data lets you be. Look for
    things like: correlation unusually high/low for the pair, momentum decoupling, flows contradicting
    price, indicator divergences between assets, risk building in one name while draining from another.
    Non-obvious and contrarian observations are welcome — as long as the numbers back them.

    **Actionable Angles (3-7 days)**
    For each standout observation that supports action: the practical implication (favor/avoid/pair/
    hedge framing), the level or condition that invalidates it, and what confirmation (volume, flow,
    OI) to watch. If an observation is interesting but not yet actionable, say exactly what would
    make it actionable. If nothing is actionable, say so plainly — no forced trades.

    Skip anything the data doesn't support. Base all conclusions ONLY on the provided data and
    precomputed statistics.
    `.trim()

    if (!gemini) {
      throw new Error('Gemini client not configured')
    }

    const result = streamText({
      model: gemini('gemini-2.5-flash'),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxOutputTokens: 7000, // combined report across 2-5 assets
      abortSignal: req.signal,
      onFinish: ({ finishReason }: { finishReason: string }) => {
        if (finishReason === 'length') {
          console.warn('Compare response was truncated due to token limit!')
        }
      },
    } as Parameters<typeof streamText>[0])

    return result.toTextStreamResponse({
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Compare analysis error:', error)
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: 'Invalid data format', details: error.errors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response(
      JSON.stringify({ error: 'Failed to generate analysis' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
