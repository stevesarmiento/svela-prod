import type { NewsSentiment, OverviewEvent } from "./types";

export function clampPercentChange(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 9999) return 9999;
  if (value < -9999) return -9999;
  return value;
}

/** Group label for a given timestamp relative to today. */
export function dateBucket(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterdayStart = todayStart - 86_400_000;

  if (ms >= todayStart) return "Today";
  if (ms >= yesterdayStart) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Group an ordered event list by date bucket, preserving order. */
export function groupByDate(
  events: OverviewEvent[],
): { label: string; events: OverviewEvent[] }[] {
  const groups: { label: string; events: OverviewEvent[] }[] = [];
  let current: { label: string; events: OverviewEvent[] } | null = null;

  for (const event of events) {
    const label = dateBucket(event.occurredAtMs);
    if (!current || current.label !== label) {
      current = { label, events: [] };
      groups.push(current);
    }
    current.events.push(event);
  }

  return groups;
}

export function formatRelativeTime(ms: number, nowMs: number): string {
  const diffMs = nowMs - ms;
  if (!Number.isFinite(diffMs)) return "\u2014";
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function sentimentLabel(sentiment: Exclude<NewsSentiment, null>): string {
  if (sentiment === "bullish") return "Bullish";
  if (sentiment === "bearish") return "Bearish";
  return "Neutral";
}

export function sentimentVariant(
  sentiment: Exclude<NewsSentiment, null>,
): "success" | "destructive" | "warning" {
  if (sentiment === "bullish") return "success";
  if (sentiment === "bearish") return "destructive";
  return "warning";
}

export function parseBreakoutTimeframeDays(title: string): string | null {
  const match = title.match(/\b(\d+)d\b/i);
  if (!match) return null;
  return match[1] ?? null;
}
