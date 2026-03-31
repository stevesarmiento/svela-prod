"use client"

import React from "react"
import ReactMarkdown from "react-markdown"
import { motion, useReducedMotion } from "motion/react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@v1/ui/dialog"
import { Button } from "@v1/ui/button"
import { ScrollArea } from "@v1/ui/scroll-area"
import { MultiStepLoader } from "@v1/ui/mult-step-loader"
import { cn } from "@v1/ui/cn"
import { useCompletion } from "@ai-sdk/react"
import { IconArrowBackward, IconArrowUpRight, IconChevronBackward, IconTextAppend } from "symbols-react"
import NumberFlow from "@/components/number-flow"
import { TokenLogo } from "@/components/token-logo"
import { cleanTokenName } from "@/lib/logo-overrides"
import { getUsdPriceFormatOptions } from "@/lib/format-usd"
import type { Format } from "@/lib/number-flow/lite"

export type IndicatorType = "marketVision" | "bollinger" | "bbwp"

interface MarketContext {
  priceUsd?: number | null
  change24hPct?: number | null
  volume24hUsd?: number | null
  marketCapUsd?: number | null
  /** Same-length trail as indicator series (closes) for price-vs-indicator copy. */
  closeHistory?: ReadonlyArray<number>
  /** Unix seconds per bar, same length as closeHistory, for calendar 7d slices. */
  closeTimesUtc?: ReadonlyArray<number>
}

interface MarketVisionSnapshot {
  rsiCurrent: number | null
  rsiHistory: Array<number | null>
  wt1Current: number | null
  wt2Current: number | null
  moneyFlowCurrent: number | null
  moneyFlowHistory: Array<number | null>
}

interface BollingerSnapshot {
  indicatorCurrent: number | null
  upperCurrent: number | null
  lowerCurrent: number | null
  basisCurrent: number | null
  indicatorHistory: Array<number | null>
  upperHistory: Array<number | null>
  lowerHistory: Array<number | null>
}

interface BBWPSnapshot {
  bbwpCurrent: number | null
  bbwpHistory: Array<number | null>
  lookback: number
}

type IndicatorSnapshot =
  | { indicatorType: "marketVision"; snapshot: MarketVisionSnapshot }
  | { indicatorType: "bollinger"; snapshot: BollingerSnapshot }
  | { indicatorType: "bbwp"; snapshot: BBWPSnapshot }

interface IndicatorExplainDialogBaseProps {
  coinId: string
  tokenSymbol?: string | null
  tokenName?: string | null
  /** Resolved logo URL (e.g. from getTokenLogoURL(symbol, image)). */
  tokenLogoUrl?: string | null
  /** Pulse price while quote/chart loading (matches price-chart pending UX). */
  isPricePending?: boolean
  timeframe: string
  indicatorTitle: string
  /** Same chart as the indicator card (Market Vision / RSI+Bands / BBWP) for visual context. */
  indicatorChart?: React.ReactNode
  /** Live indicator chips / summary — shown under the title while reading the analysis. */
  indicatorContext?: React.ReactNode
  marketContext?: MarketContext
  disabled?: boolean
  triggerClassName?: string
}

export type IndicatorExplainDialogProps =
  | (IndicatorExplainDialogBaseProps & {
      indicatorType: "marketVision"
      snapshot: MarketVisionSnapshot
    })
  | (IndicatorExplainDialogBaseProps & {
      indicatorType: "bollinger"
      snapshot: BollingerSnapshot
    })
  | (IndicatorExplainDialogBaseProps & { indicatorType: "bbwp"; snapshot: BBWPSnapshot })

/** Avoid showing page placeholder copy ("Loading...") when quote metadata is not wired yet. */
function resolveExplainDisplayName(args: {
  tokenName?: string | null
  tokenSymbol?: string | null
  coinId: string
}): string {
  const raw = args.tokenName?.trim()
  if (raw && raw !== "Loading..." && raw !== "Unknown") {
    return cleanTokenName(raw)
  }
  const sym = args.tokenSymbol?.trim()
  if (sym && sym.toUpperCase() !== "LOADING") {
    return sym.toUpperCase()
  }
  return args.coinId
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

function ExplainQuoteHeader(props: {
  displayName: string
  safeLogoSrc: string
  fallbackSymbol?: string | null
  priceUsd: number
  change24hPct: number | null
  isPending: boolean
  /** e.g. back / close control — sits immediately before the token logo */
  leadingAction?: React.ReactNode
}) {
  const shouldReduceMotion = useReducedMotion()
  const change = props.change24hPct
  const changeOk = change != null && Number.isFinite(change)

  return (
    <div
      className={cn(
        "",
        props.isPending && "opacity-95",
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 ml-[-32px]">
          {props.leadingAction}
          <TokenLogo
            src={props.safeLogoSrc}
            alt={props.displayName}
            sizePx={20}
            fallbackText={props.fallbackSymbol ?? undefined}
            className="bg-transparent"
            quality={70}
          />
          <span className="text-sm font-bold text-white">{props.displayName}</span>
          <span className="text-primary/60 text-sm">is currently</span>
        </div>
        <div className="flex items-center">
          <NumberFlow
            value={props.priceUsd}
            format={getUsdPriceFormatOptions(props.priceUsd) as Format}
            willChange
            className={cn(
              "text-3xl font-bold font-sans text-white",
              props.isPending && "animate-pulse motion-reduce:animate-none",
            )}
          />
          {props.isPending ? (
            <div className="inline-flex items-center ml-2">
              <div className="size-2 rounded-full bg-white/50 animate-pulse motion-reduce:animate-none" />
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            "text-xs font-bold font-berkeley-mono",
            !changeOk ? "text-muted-foreground" : change >= 0 ? "text-emerald-500" : "text-rose-500",
          )}
        >
          {!changeOk ? (
            <span>N/A</span>
          ) : (
            <>
              <motion.span
                key={change >= 0 ? "up" : "down"}
                initial={{ rotate: change >= 0 ? 0 : 90 }}
                animate={{ rotate: change >= 0 ? 0 : 90 }}
                transition={
                  shouldReduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.3, duration: 0.3 }
                }
                className="mr-2 inline-block"
                style={{ transformOrigin: "center" }}
              >
                <IconArrowUpRight
                  className={cn("size-2", change >= 0 ? "fill-emerald-500" : "fill-rose-500")}
                />
              </motion.span>
              <span>{Math.abs(change).toFixed(2)}%</span>
              <span className="ml-1.5 font-normal text-muted-foreground">24h</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function buildRequestBody(args: IndicatorExplainDialogProps) {
  return {
    indicatorType: args.indicatorType,
    token: {
      coinId: args.coinId,
      name: args.tokenName ?? null,
      symbol: args.tokenSymbol ?? null,
    },
    timeframe: args.timeframe,
    marketContext: args.marketContext ?? {},
    snapshot: args.snapshot,
  }
}

export function IndicatorExplainDialog(props: IndicatorExplainDialogProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const displayName = resolveExplainDisplayName({
    tokenName: props.tokenName,
    tokenSymbol: props.tokenSymbol,
    coinId: props.coinId,
  })
  const safeLogoSrc =
    props.tokenLogoUrl && (props.tokenLogoUrl.startsWith("http") || props.tokenLogoUrl.startsWith("/"))
      ? props.tokenLogoUrl
      : "/favicon.ico"
  const mc = props.marketContext
  const priceUsd = mc?.priceUsd
  const change24h = mc?.change24hPct
  const showQuoteHeader =
    priceUsd != null && Number.isFinite(priceUsd) && priceUsd > 0

  const {
    complete,
    completion,
    isLoading,
    stop,
    setCompletion,
    error,
  } = useCompletion({
    api: "/api/analyze-indicator",
    experimental_throttle: 60,
    onError: (err) => {
      console.error("indicator explain:", err)
    },
  })

  const run = React.useCallback(async () => {
    const body = buildRequestBody(props)
    setCompletion("")
    stop()
    await complete(JSON.stringify(body))
  }, [complete, props, setCompletion, stop])

  const explainLoadingSteps = React.useMemo(
    () => [
      { text: "Reading indicator values" },
      { text: "Comparing to recent price action" },
      { text: "Checking trend and volatility context" },
      { text: "Thinking through what it implies" },
      { text: "Writing the explanation" },
      { text: "Almost there..." },
    ],
    [],
  )

  const showPending = Boolean(isLoading)
  const showError = Boolean(error)
  const showStreamLoader =
    showPending && completion.trim().length === 0 && !showError

  const regenerateButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={showPending}
      className="flex items-center gap-1.5 shrink-0 p-1.5 h-7 rounded-lg"
      onClick={() => {
        void run()
      }}
    >
      <IconTextAppend
        className="size-3 fill-primary/60"
      />
      Regenerate
    </Button>
  )

  const explainBackButton = (
    <DialogClose asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 rounded-lg text-white hover:bg-white/10"
        aria-label="Back"
      >
        <IconArrowBackward className="size-3 fill-current" aria-hidden />
      </Button>
    </DialogClose>
  )

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          stop()
          return
        }
        void run()
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.disabled}
          className={cn("flex items-center gap-1.5 shrink-0 h-8 rounded-lg", props.triggerClassName)}
        >
        <IconTextAppend
          className="size-3 fill-primary/60"
        />
          Analyze
        </Button>
      </DialogTrigger>
      <DialogContent
        hideTitle
        hideClose
        title={`${props.indicatorTitle}${props.tokenSymbol ? ` ${props.tokenSymbol.toUpperCase()}` : ""} ${props.timeframe}`}
        className="max-w-xl w-full border-0 bg-transparent shadow-none backdrop-blur-none before:hidden after:hidden gap-0 px-4 pb-4 pt-14 sm:rounded-2xl"
      >
        <DialogHeader className="space-y-3 text-left">
          {showQuoteHeader ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <ExplainQuoteHeader
                  leadingAction={explainBackButton}
                  displayName={displayName}
                  safeLogoSrc={safeLogoSrc}
                  fallbackSymbol={props.tokenSymbol}
                  priceUsd={priceUsd}
                  change24hPct={
                    change24h != null && Number.isFinite(change24h) ? change24h : null
                  }
                  isPending={Boolean(props.isPricePending)}
                />
              </div>
              {regenerateButton}
            </div>
          ) : null}
          {!showQuoteHeader &&
          !(props.indicatorChart != null || props.indicatorContext != null) ? (
            <div className="flex items-center justify-between gap-2">
              {explainBackButton}
              {regenerateButton}
            </div>
          ) : null}
          {props.indicatorChart != null || props.indicatorContext != null ? (
            <div className="">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-1">
                  {!showQuoteHeader ? (
                    <div className="pt-0.5">{explainBackButton}</div>
                  ) : null}
                  <div className="min-w-0 text-sm font-semibold text-balance text-foreground">
                    {props.indicatorTitle}
                    {props.tokenSymbol ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                        analysis for {props.tokenSymbol.toUpperCase()} on a {props.timeframe} timeframe
                      </span>
                    ) : (
                      <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                        {props.timeframe}
                      </span>
                    )}
                  </div>
                </div>
                {!showQuoteHeader ? regenerateButton : null}
              </div>
              {props.indicatorChart != null ? (
                <div className="mt-2 w-full overflow-hidden rounded-lg border border-white/5 bg-zinc-950/50">
                  {props.indicatorChart}
                </div>
              ) : null}
              {props.indicatorContext != null ? (
                <div className={cn("flex flex-wrap gap-1.5", props.indicatorChart != null ? "mt-2" : "mt-1.5")}>
                  {props.indicatorContext}
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogHeader>

        <div className="relative">
          <ScrollArea className="h-[min(42vh,20rem)] pr-4 mt-8">
            <div className="prose prose-invert max-w-none text-pretty min-h-[min(42vh,20rem)]">
              {showError ? (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  Could not generate an explanation. Try again in a moment.
                </div>
              ) : null}

              {showStreamLoader ? (
                <div className="not-prose flex min-h-[min(42vh,20rem)] w-full items-start justify-center py-6">
                  <MultiStepLoader
                    loadingStates={explainLoadingSteps}
                    loading
                    duration={2000}
                    loop
                    variant="inline"
                  />
                </div>
              ) : null}

              {!showStreamLoader && completion.trim().length > 0 ? (
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h2 className="text-base font-semibold text-white mt-6 mb-2">
                        {children}
                      </h2>
                    ),
                    h2: ({ children }) => (
                      <h3 className="text-sm font-semibold text-white mt-5 mb-2">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-sm leading-relaxed text-zinc-300 mb-3">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside text-sm text-zinc-300 space-y-1 mb-3">
                        {children}
                      </ul>
                    ),
                    li: ({ children }) => <li className="text-zinc-300">{children}</li>,
                    strong: ({ children }) => (
                      <strong className="text-white font-semibold">{children}</strong>
                    ),
                  }}
                >
                  {completion}
                </ReactMarkdown>
              ) : null}

              {!showStreamLoader &&
              !showError &&
              !showPending &&
              completion.trim().length === 0 ? (
                <div className="text-sm text-muted-foreground">No explanation yet.</div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}

