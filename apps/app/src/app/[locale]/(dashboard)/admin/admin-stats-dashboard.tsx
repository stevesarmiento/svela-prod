"use client";

import { Badge } from "@v1/ui/badge";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@v1/ui/chart";
import { cn } from "@v1/ui/cn";
import { formatLargeNumber } from "@v1/ui/format-numbers";
import type { Preloaded } from "convex/react";
import { usePreloadedQuery } from "convex/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { api } from "../../../../../convex/_generated/api";

const signupsChartConfig = {
  count: {
    label: "Signups",
    color: "var(--chart-1, hsl(220 70% 50%))",
  },
} satisfies ChartConfig;

const MAX_GROUP_NAME_BADGES = 2;

const USERS_GRID =
  "minmax(0, 2fr) minmax(0, 2fr) minmax(0, 0.6fr) minmax(0, 0.6fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 1fr)";

const MICRO_HEADER =
  "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
const MONO_NUM = "font-berkeley-mono text-[11px] tabular-nums";

function formatCount(count: number, capped: boolean): string {
  return `${capped ? "≥" : ""}${count.toLocaleString()}`;
}

function formatDate(timestampMs: number): string {
  return new Date(timestampMs).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Best displayable identity: name → email → wallet → anonymous. */
function displayIdentity(user: {
  fullName?: string;
  email?: string;
  walletAddress?: string;
}): { primary: string; secondary?: string } {
  if (user.fullName) {
    return {
      primary: user.fullName,
      secondary:
        user.email ??
        (user.walletAddress ? truncateAddress(user.walletAddress) : undefined),
    };
  }
  if (user.email) {
    return {
      primary: user.email,
      secondary: user.walletAddress
        ? truncateAddress(user.walletAddress)
        : undefined,
    };
  }
  if (user.walletAddress) {
    return {
      primary: truncateAddress(user.walletAddress),
      secondary: "wallet",
    };
  }
  return { primary: "anonymous" };
}

/** App-style section frame: rounded outer inset + bordered body card. */
function Section(props: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <div className="rounded-[10px] bg-primary/5 p-0.5">
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className={MICRO_HEADER}>{props.title}</span>
        {props.meta}
      </div>
      <div
        className={cn(
          "rounded-lg border border-primary/5 bg-white shadow-sm dark:bg-primary/5",
          props.bodyClassName,
        )}
      >
        {props.children}
      </div>
    </div>
  );
}

function StatTile(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[10px] bg-primary/5 p-0.5">
      <div className="rounded-lg border border-primary/5 bg-white px-4 py-3 shadow-sm dark:bg-primary/5">
        <div className="text-[11px] font-medium text-muted-foreground">
          {props.label}
        </div>
        <div className="mt-1 font-berkeley-mono text-2xl tabular-nums">
          {props.value}
        </div>
        {props.hint ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{props.hint}</p>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState(props: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-6 text-center">
      <p className="text-sm text-muted-foreground">{props.message}</p>
    </div>
  );
}

function UsageCell(props: { count: number; lastAt?: number }) {
  if (props.count === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="text-right">
      <span className={MONO_NUM}>{props.count}</span>
      {props.lastAt ? (
        <div className="text-[10px] text-muted-foreground">
          {formatDate(props.lastAt)}
        </div>
      ) : null}
    </div>
  );
}

type WatchlistUserRow = {
  fullName?: string;
  email?: string;
  walletAddress?: string;
  signedUpAt: number;
  groupCount: number;
  groups: Array<{ name: string; tokens: number }>;
  tokensWatched: number;
  holdingsCount: number;
  holdings: Array<{ coinId: string; amount: number }>;
  analyzeCount: number;
  analyzeLastAt?: number;
  screenerCount: number;
  screenerLastAt?: number;
};

function WatchlistUserExpanded(props: { row: WatchlistUserRow }) {
  const { row } = props;
  return (
    <div className="border-t border-primary/5 bg-primary/[0.02] px-4 py-3 dark:bg-black/10">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Watchlists */}
        <div>
          <div className={cn(MICRO_HEADER, "mb-1.5")}>
            Watchlists ({row.groupCount})
          </div>
          <div className="divide-y divide-primary/5">
            {row.groups.map((group) => (
              <div
                key={group.name}
                className="flex items-center justify-between gap-2 py-1"
              >
                <span className="truncate text-xs">{group.name}</span>
                <span className={cn(MONO_NUM, "text-muted-foreground")}>
                  {group.tokens} {group.tokens === 1 ? "token" : "tokens"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Holdings */}
        <div>
          <div className={cn(MICRO_HEADER, "mb-1.5")}>
            Holdings ({row.holdingsCount})
          </div>
          {row.holdings.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">
              No holdings entered.
            </p>
          ) : (
            <div className="divide-y divide-primary/5">
              {row.holdings.map((holding) => (
                <div
                  key={holding.coinId}
                  className="flex items-center justify-between gap-2 py-1"
                >
                  <span className="truncate text-xs">{holding.coinId}</span>
                  <span className={MONO_NUM}>
                    {formatLargeNumber(holding.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Account + AI */}
        <div className="space-y-2">
          <div>
            <div className={cn(MICRO_HEADER, "mb-1.5")}>Account</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Email</span>
                <span className="truncate">{row.email ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Wallet</span>
                {row.walletAddress ? (
                  <span
                    className={cn(MONO_NUM, "break-all text-right")}
                    title={row.walletAddress}
                  >
                    {row.walletAddress}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Joined</span>
                <span className={MONO_NUM}>
                  {row.signedUpAt ? formatDate(row.signedUpAt) : "—"}
                </span>
              </div>
            </div>
          </div>
          <div>
            <div className={cn(MICRO_HEADER, "mb-1.5")}>AI usage</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Analyze</span>
                <span className={MONO_NUM}>
                  {row.analyzeCount > 0
                    ? `${row.analyzeCount}× · last ${row.analyzeLastAt ? formatDate(row.analyzeLastAt) : "—"}`
                    : "never"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Screener search</span>
                <span className={MONO_NUM}>
                  {row.screenerCount > 0
                    ? `${row.screenerCount}× · last ${row.screenerLastAt ? formatDate(row.screenerLastAt) : "—"}`
                    : "never"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WatchlistUsersTable(props: {
  rows: WatchlistUserRow[];
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[880px]">
        {/* Header */}
        <div
          className="grid gap-4 px-4 py-1.5"
          style={{ gridTemplateColumns: USERS_GRID }}
        >
          <span className={MICRO_HEADER}>User</span>
          <span className={MICRO_HEADER}>Watchlists</span>
          <span className={cn(MICRO_HEADER, "text-right")}>Tokens</span>
          <span className={cn(MICRO_HEADER, "text-right")}>Holdings</span>
          <span className={cn(MICRO_HEADER, "text-right")}>AI analyze</span>
          <span className={cn(MICRO_HEADER, "text-right")}>AI screener</span>
          <span className={cn(MICRO_HEADER, "text-right")}>Joined</span>
        </div>

        <div className="divide-y divide-primary/5">
          {props.rows.map((row, index) => {
            const identity = displayIdentity(row);
            const isExpanded = expanded.has(index);
            return (
              <div key={`${identity.primary}-${row.signedUpAt}-${index}`}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggle(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggle(index);
                    }
                  }}
                  className={cn(
                    "grid cursor-pointer items-center gap-4 px-4 py-2.5 transition-opacity duration-200",
                    "hover:bg-primary/[0.02] hover:rounded-[7px] hover:ring-2 hover:ring-inset hover:ring-white/20",
                  )}
                  style={{ gridTemplateColumns: USERS_GRID }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        !isExpanded && "-rotate-90",
                      )}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">
                        {identity.primary}
                      </div>
                      {identity.secondary ? (
                        <div className="truncate text-[10px] text-muted-foreground">
                          {identity.secondary}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <span className={MONO_NUM}>{row.groupCount}</span>
                    {row.groups.slice(0, MAX_GROUP_NAME_BADGES).map((group) => (
                      <Badge
                        key={group.name}
                        variant="secondary"
                        className="max-w-28 truncate font-normal"
                      >
                        {group.name}
                      </Badge>
                    ))}
                    {row.groups.length > MAX_GROUP_NAME_BADGES ? (
                      <span className="text-[10px] text-muted-foreground">
                        +{row.groups.length - MAX_GROUP_NAME_BADGES}
                      </span>
                    ) : null}
                  </div>

                  <span className={cn(MONO_NUM, "text-right")}>
                    {row.tokensWatched}
                  </span>
                  <span className={cn(MONO_NUM, "text-right")}>
                    {row.holdingsCount > 0 ? (
                      row.holdingsCount
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                  <div className="flex justify-end">
                    <UsageCell
                      count={row.analyzeCount}
                      lastAt={row.analyzeLastAt}
                    />
                  </div>
                  <div className="flex justify-end">
                    <UsageCell
                      count={row.screenerCount}
                      lastAt={row.screenerLastAt}
                    />
                  </div>
                  <span
                    className={cn(MONO_NUM, "text-right text-muted-foreground")}
                  >
                    {row.signedUpAt ? formatDate(row.signedUpAt) : "—"}
                  </span>
                </div>
                {isExpanded ? <WatchlistUserExpanded row={row} /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Simple app-styled list table for the smaller sections. */
function MiniTable(props: {
  headers: Array<{ label: string; align?: "right" }>;
  rows: Array<Array<React.ReactNode>>;
}) {
  const template = `minmax(0, 2fr) ${props.headers
    .slice(1)
    .map(() => "minmax(0, 1fr)")
    .join(" ")}`;
  return (
    <div>
      <div
        className="grid gap-4 px-4 py-1.5"
        style={{ gridTemplateColumns: template }}
      >
        {props.headers.map((header) => (
          <span
            key={header.label}
            className={cn(
              MICRO_HEADER,
              header.align === "right" && "text-right",
            )}
          >
            {header.label}
          </span>
        ))}
      </div>
      <div className="divide-y divide-primary/5">
        {props.rows.map((cells, rowIndex) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static display rows
            key={rowIndex}
            className="grid items-center gap-4 px-4 py-2"
            style={{ gridTemplateColumns: template }}
          >
            {cells.map((cell, cellIndex) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static display cells
                key={cellIndex}
                className={cn(
                  "min-w-0 truncate text-xs",
                  props.headers[cellIndex]?.align === "right" &&
                    cn(MONO_NUM, "text-right"),
                )}
              >
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminStatsDashboard(props: {
  preloadedStats: Preloaded<typeof api.adminStats.getAdminDashboardStats>;
}) {
  const stats = usePreloadedQuery(props.preloadedStats);

  if (stats === null) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center px-4">
        <div className="rounded-lg border border-dashed border-border px-8 py-6 text-center">
          <h3 className="font-medium">Not authorized</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account is not on the admin allowlist for this dashboard.
          </p>
        </div>
      </div>
    );
  }

  const { userGrowth, adoption, watchlistUsers, coins, aiHealth } = stats;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 py-1">
        <div>
          <h1 className="text-2xl font-semibold">Admin dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Internal product stats. Live via Convex.
          </p>
        </div>
        <Badge variant="outline" className="font-berkeley-mono tabular-nums">
          Updated {new Date(stats.generatedAt).toLocaleTimeString()}
        </Badge>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total users"
          value={formatCount(userGrowth.totalUsers, userGrowth.capped)}
        />
        <StatTile
          label="Watchlist groups"
          value={formatCount(
            adoption.watchlistGroups.total,
            adoption.watchlistGroups.capped,
          )}
          hint={`${formatCount(adoption.watchlistGroups.users, adoption.watchlistGroups.capped)} users`}
        />
        <StatTile
          label="Portfolio wallets"
          value={formatCount(adoption.wallets.total, adoption.wallets.capped)}
          hint={`${formatCount(adoption.wallets.users, adoption.wallets.capped)} users · ${adoption.wallets.active} active · ${adoption.wallets.withSyncError} sync errors`}
        />
        <StatTile
          label="Users with holdings"
          value={formatCount(adoption.holdings.users, adoption.holdings.capped)}
          hint={`${formatCount(adoption.holdings.rows, adoption.holdings.capped)} holding rows`}
        />
      </div>

      {/* Signups over time */}
      <Section title="Signups — last 30 days">
        <div className="p-4">
          <ChartContainer
            config={signupsChartConfig}
            className="aspect-auto h-56 w-full"
          >
            <BarChart data={userGrowth.signupsByDay}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(value: string) => value.slice(5)}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
        </div>
      </Section>

      {/* Per-user watchlist detail */}
      <Section
        title={`Watchlist users (${watchlistUsers.totalUsersWithWatchlists})${
          watchlistUsers.truncated
            ? ` — showing top ${watchlistUsers.rows.length}`
            : ""
        }`}
        meta={
          <span className="text-[10px] text-muted-foreground">
            Click a row for details · AI counts start from launch day
          </span>
        }
      >
        {watchlistUsers.rows.length === 0 ? (
          <div className="p-4">
            <EmptyState message="No users with watchlists yet." />
          </div>
        ) : (
          <WatchlistUsersTable rows={watchlistUsers.rows} />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent signups */}
        <Section title="Recent signups">
          {userGrowth.recentSignups.length === 0 ? (
            <div className="p-4">
              <EmptyState message="No users yet." />
            </div>
          ) : (
            <MiniTable
              headers={[
                { label: "User" },
                { label: "Email / wallet" },
                { label: "Joined", align: "right" },
              ]}
              rows={userGrowth.recentSignups.map((signup) => {
                const identity = displayIdentity(signup);
                return [
                  identity.primary,
                  <span key="secondary" className="text-muted-foreground">
                    {identity.secondary ?? "—"}
                  </span>,
                  formatDate(signup.createdAt),
                ];
              })}
            />
          )}
        </Section>

        {/* Most-watched coins */}
        <Section title="Most-watched coins">
          {coins.topWatched.length === 0 ? (
            <div className="p-4">
              <EmptyState message="No watchlist entries yet." />
            </div>
          ) : (
            <>
              <MiniTable
                headers={[
                  { label: "Coin" },
                  { label: "Symbol" },
                  { label: "Watchers", align: "right" },
                ]}
                rows={coins.topWatched.map((coin) => [
                  coin.name ?? coin.coinId,
                  <span
                    key="symbol"
                    className="font-berkeley-mono uppercase text-muted-foreground"
                  >
                    {coin.symbol ?? "—"}
                  </span>,
                  coin.watchers,
                ])}
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-primary/5 px-4 py-2.5">
                <span className="text-[10px] text-muted-foreground">
                  Tracked coins by reason:
                </span>
                {coins.trackedByReason.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground">
                    none
                  </span>
                ) : (
                  coins.trackedByReason.map((tracked) => (
                    <Badge key={tracked.reason} variant="secondary">
                      {tracked.reason}: {tracked.count}
                    </Badge>
                  ))
                )}
              </div>
            </>
          )}
        </Section>

        {/* AI health */}
        <Section title="AI feature health">
          <div className="space-y-3 p-4">
            <div className="flex gap-8">
              <div>
                <div className="font-berkeley-mono text-2xl tabular-nums">
                  {formatCount(aiHealth.total7d, aiHealth.capped)}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  prompt failures, 7d
                </p>
              </div>
              <div>
                <div className="font-berkeley-mono text-2xl tabular-nums">
                  {formatCount(aiHealth.total30d, aiHealth.capped)}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  prompt failures, 30d
                </p>
              </div>
            </div>
            {aiHealth.total30d === 0 ? (
              <EmptyState message="No smart screener prompt failures in the last 30 days." />
            ) : (
              <div className="space-y-3">
                <MiniTable
                  headers={[
                    { label: "Surface" },
                    { label: "7d", align: "right" },
                    { label: "30d", align: "right" },
                  ]}
                  rows={aiHealth.bySurface.map((row) => [
                    <span key="surface" className="capitalize">
                      {row.surface}
                    </span>,
                    row.count7d,
                    row.count30d,
                  ])}
                />
                <MiniTable
                  headers={[
                    { label: "Error type" },
                    { label: "7d", align: "right" },
                    { label: "30d", align: "right" },
                  ]}
                  rows={aiHealth.byErrorType.map((row) => [
                    row.errorType,
                    row.count7d,
                    row.count30d,
                  ])}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    Confidence buckets:
                  </span>
                  {aiHealth.byConfidenceBucket.map((bucket) => (
                    <Badge key={bucket.bucket} variant="secondary">
                      {bucket.bucket}: {bucket.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
