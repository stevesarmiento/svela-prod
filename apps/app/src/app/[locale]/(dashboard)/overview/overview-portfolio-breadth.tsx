"use client";

import { COLOR_THEMES } from "@/components/color-picker";
import { TickMeter } from "@/components/tick-meter";
import type { BreadthStats } from "@/lib/overview-daily-brief";
import { Button } from "@v1/ui/button";
import { cn } from "@v1/ui/cn";
import Link from "next/link";
import { useState } from "react";
import { IconChevronBackward, IconChevronForward } from "symbols-react";

/** One watchlist group's aggregate 24h performance. */
export interface BreadthGroupRow {
  id: string;
  name: string;
  slug: string;
  color: string;
  changePct: number;
  coinCount: number;
}

function signedPctLabel(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function StatTile(props: {
  value: string;
  label: string;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "text-sm font-semibold tabular-nums font-berkeley-mono text-zinc-900 dark:text-white truncate",
          props.valueClass,
        )}
      >
        {props.value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
        {props.label}
      </div>
    </div>
  );
}

/**
 * Advancers / flat / decliners split rendered in the tick-meter idiom: three
 * fully-filled tick segments sized by their share of the watchlist.
 */
function TickSplitBar(props: { breadth: BreadthStats; total: number }) {
  const { breadth, total } = props;
  const segments = [
    {
      key: "advancers",
      count: breadth.advancers,
      colorClass: "text-emerald-500/90",
    },
    {
      key: "flat",
      count: breadth.flat,
      colorClass: "text-zinc-400/70 dark:text-white/25",
    },
    {
      key: "decliners",
      count: breadth.decliners,
      colorClass: "text-rose-500/90",
    },
  ];
  return (
    <div
      className="flex h-2 w-full"
      role="img"
      aria-label={`${breadth.advancers} advancing, ${breadth.flat} flat, ${breadth.decliners} declining`}
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          className={segment.colorClass}
          style={{ width: `${(segment.count / total) * 100}%` }}
        >
          <TickMeter value={1} min={0} max={1} className="h-2 w-full" />
        </span>
      ))}
    </div>
  );
}

const SKELETON_TILE_KEYS = [
  "breadth-tile-sk-1",
  "breadth-tile-sk-2",
  "breadth-tile-sk-3",
  "breadth-tile-sk-4",
] as const;

function BreadthSkeleton() {
  return (
    <div className="mt-4 animate-pulse" aria-hidden="true">
      <div className="h-2 w-full rounded bg-zinc-950/10 dark:bg-white/10" />
      <div className="mt-3 grid grid-cols-4 gap-3">
        {SKELETON_TILE_KEYS.map((tileKey) => (
          <div key={tileKey} className="min-w-0">
            <div className="h-4 w-8 rounded bg-zinc-950/10 dark:bg-white/10" />
            <div className="mt-1 h-2.5 w-12 rounded bg-zinc-950/10 dark:bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rows per page — keeps the sticky left column shorter than the viewport. */
const GROUP_PAGE_SIZE = 8;

/**
 * Per-group performance rows in the sector-breakdown idiom: name, signed
 * percent, and a diverging tick meter on a shared domain so bar lengths are
 * comparable across groups. Paginated so long watchlist collections don't
 * stretch the sticky column past the viewport.
 */
function BreadthGroupList(props: { groups: BreadthGroupRow[] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(
    1,
    Math.ceil(props.groups.length / GROUP_PAGE_SIZE),
  );
  const clampedPage = Math.min(page, pageCount - 1);
  const start = clampedPage * GROUP_PAGE_SIZE;
  const visibleGroups = props.groups.slice(start, start + GROUP_PAGE_SIZE);

  // Domain spans ALL groups (not just this page) so meter lengths stay
  // comparable while paging.
  const maxAbsChange = Math.max(
    1,
    ...props.groups.map((row) => Math.abs(row.changePct)),
  );

  return (
    <div className="mt-4 border-t border-zinc-200/60 dark:border-zinc-800/60">
      {visibleGroups.map((row) => {
        const isPositive = row.changePct > 0;
        const isNegative = row.changePct < 0;
        const themeKey = row.color as keyof typeof COLOR_THEMES;
        const theme = COLOR_THEMES[themeKey] ?? COLOR_THEMES.default;
        return (
          <Link
            key={row.id}
            href={`/watchlists?wg=${encodeURIComponent(row.slug)}&wt=chart`}
            aria-label={`Open ${row.name} comparison`}
            className="flex items-center justify-between gap-3 border-b border-zinc-200/60 dark:border-zinc-800/60 py-2.5 -mx-1.5 px-1.5 rounded-md transition-colors hover:bg-zinc-100/70 dark:hover:bg-white/[0.04]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full opacity-90",
                  theme.bg,
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 truncate text-[13px] font-medium text-zinc-900 dark:text-white">
                {row.name}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <span
                className={cn(
                  "font-berkeley-mono text-[12px] tabular-nums",
                  isPositive && "text-emerald-400",
                  isNegative && "text-rose-400",
                  !isPositive && !isNegative && "text-muted-foreground",
                )}
              >
                {signedPctLabel(row.changePct)}
              </span>
              <TickMeter
                value={row.changePct}
                min={-maxAbsChange}
                max={maxAbsChange}
                origin={0}
                className={cn(
                  "h-2 w-24",
                  isPositive && "text-emerald-400",
                  isNegative && "text-rose-400",
                  !isPositive && !isNegative && "text-zinc-400",
                )}
              />
            </div>
          </Link>
        );
      })}
      {pageCount > 1 ? (
        <div className="flex items-center justify-between pt-2">
          <span className="text-[10px] uppercase tracking-wide tabular-nums text-muted-foreground">
            {start + 1}–{start + visibleGroups.length} of {props.groups.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              className="size-6 p-0 rounded-lg"
              disabled={clampedPage === 0}
              onClick={() => setPage(clampedPage - 1)}
              aria-label="Previous watchlists"
            >
              <IconChevronBackward className="h-2.5 w-2.5 fill-current" />
            </Button>
            <Button
              variant="ghost"
              className="size-6 p-0 rounded-lg"
              disabled={clampedPage >= pageCount - 1}
              onClick={() => setPage(clampedPage + 1)}
              aria-label="Next watchlists"
            >
              <IconChevronForward className="h-2.5 w-2.5 fill-current" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 24h breadth under the performance chart: advancers / flat / decliners
 * split bar plus a stat row, computed over the user's full watchlist, with
 * a per-watchlist-group performance breakdown underneath.
 */
export function PortfolioBreadthSection(props: {
  breadth: BreadthStats | null;
  groups: BreadthGroupRow[];
  isLoading: boolean;
}) {
  const breadth = props.breadth;
  if (!breadth) {
    return props.isLoading ? <BreadthSkeleton /> : null;
  }

  const total = breadth.advancers + breadth.decliners + breadth.flat;
  if (total <= 0) return null;

  const medianClass =
    breadth.medianChangePct > 0
      ? "text-emerald-500"
      : breadth.medianChangePct < 0
        ? "text-rose-500"
        : undefined;

  return (
    <div className="mt-4">
      <TickSplitBar breadth={breadth} total={total} />
      <div className="mt-3 grid grid-cols-4 gap-3">
        <StatTile
          value={String(breadth.advancers)}
          label="Up"
          valueClass="text-emerald-500"
        />
        <StatTile
          value={String(breadth.decliners)}
          label="Down"
          valueClass="text-rose-500"
        />
        <StatTile
          value={signedPctLabel(breadth.medianChangePct)}
          label="Median"
          valueClass={medianClass}
        />
        <StatTile value={String(breadth.bigMovers)} label=">5% moves" />
      </div>
      {props.groups.length > 0 ? (
        <BreadthGroupList groups={props.groups} />
      ) : null}
    </div>
  );
}
