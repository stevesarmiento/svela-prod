"use client";

import { useFundingRateExchanges } from "@/hooks/use-funding-rate-exchange";
import { cn } from "@v1/ui/cn";
import { Skeleton } from "@v1/ui/skeleton";
import { TrendingUp, TrendingDown, Target } from "lucide-react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@v1/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@v1/ui/chart";

interface FundingRateProps {
  cmcId: string;
}

const chartConfig = {
  fundingRate: {
    label: "Funding Rate",
    color: "#3b82f6", // Blue
  },
} satisfies ChartConfig;

export function FundingRate({ cmcId }: FundingRateProps) {
  const { data, isLoading, error } = useFundingRateExchanges({ symbol: cmcId });

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm font-medium">24h Funding Rate</CardTitle>
          <CardDescription>Loading funding rates from exchanges...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data || !data.data?.length) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm font-medium">24h Funding Rate</CardTitle>
          <CardDescription>No funding rate data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            No funding rate data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Extract funding rate data from the response
  const fundingData = data.data?.[0]; // Get first symbol's data
  const stablecoinRates = fundingData?.stablecoinMarginList || [];
  const tokenRates = fundingData?.tokenMarginList || [];
  
  // Calculate average funding rate across exchanges
  const allRates = [...stablecoinRates, ...tokenRates];
  const actualRate = allRates.length > 0 
    ? allRates.reduce((sum, rate) => sum + rate.fundingRate, 0) / allRates.length 
    : 0;
  
  const isActualPositive = actualRate > 0;
  
  // For chart data, transform exchange data
  const chartData = allRates.map((rate) => ({
    name: rate.exchange,
    fundingRate: rate.fundingRate,
    interval: rate.fundingRateInterval,
    nextFunding: rate.nextFundingTime
  }));

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">24h Funding Rate</CardTitle>
            <CardDescription>Average across exchanges</CardDescription>
          </div>
          <div className="text-right space-y-1">
            <div className={cn(
              "text-sm font-diatype-mono font-semibold",
              isActualPositive ? "text-emerald-500" : "text-rose-500"
            )}>
              {actualRate ? `${isActualPositive ? '+' : ''}${(actualRate * 100).toFixed(4)}%` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground">
              Actual Rate
            </div>
            <div className="text-xs text-muted-foreground">
              {allRates.length} exchange{allRates.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full">
          <ChartContainer config={chartConfig}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                interval="preserveStartEnd"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => value.slice(0, 8)} // Show exchange name
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => `${value.toFixed(3)}%`}
              />
              <ChartTooltip 
                content={<ChartTooltipContent hideLabel />}
                formatter={(value: number, name: string) => [
                  `${(value as number).toFixed(4)}%`,
                  chartConfig[name as keyof typeof chartConfig]?.label || name
                ]}
                labelFormatter={(label) => `Exchange: ${label}`}
              />
              <ChartLegend content={<ChartLegendContent />} />
              {/* Funding rate line */}
              <Line
                type="monotone"
                dataKey="fundingRate"
                stroke="var(--color-fundingRate)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--color-fundingRate)", strokeWidth: 2 }}
                name="fundingRate"
              />
            </LineChart>
          </ChartContainer>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Current funding rate: {(actualRate * 100).toFixed(4)}%
          {isActualPositive ? (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-rose-500" />
          )}
        </div>
        <div className="flex gap-2 leading-none text-muted-foreground">
          <Target className="h-4 w-4" />
          Real-time funding rates
        </div>
        <div className="text-muted-foreground leading-none">
          {isActualPositive ? 'Longs pay shorts' : 'Shorts pay longs'} • Average across {allRates.length} exchanges
        </div>
      </CardFooter>
    </Card>
  );
}