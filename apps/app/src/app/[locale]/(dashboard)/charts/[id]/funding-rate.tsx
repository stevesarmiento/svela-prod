"use client";

import { useFundingRate } from "@/hooks/use-funding-rate";
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
  ChartConfig,
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
  actualRate: {
    label: "Actual Rate",
    color: "#3b82f6", // Blue
  },
  predictedRate: {
    label: "Predicted Rate",
    color: "#8b5cf6", // Purple
  },
} satisfies ChartConfig;

export function FundingRate({ cmcId }: FundingRateProps) {
  const { data, isLoading, error } = useFundingRate(cmcId);

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm font-medium">24h Funding Rate</CardTitle>
          <CardDescription>Loading actual & predicted funding rates...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data || !data.combinedHistorical?.length) {
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

  // Calculate trends
  const actualRate = data.actualFundingRate;
  const predictedRate = data.predictedFundingRate;
  const firstActual = data.combinedHistorical[0]?.actualRateRaw || 0;
  const actualTrend = actualRate && firstActual ? actualRate - firstActual : 0;
  const isActualPositive = actualRate && actualRate > 0;
  const isPredictedPositive = predictedRate && predictedRate > 0;
  const isUpTrend = actualTrend > 0;

  // Calculate accuracy (how close predicted is to actual)
  const accuracy = actualRate && predictedRate 
    ? (1 - Math.abs(actualRate - predictedRate) / Math.abs(actualRate)) * 100 
    : 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">24h Funding Rate</CardTitle>
            <CardDescription>Actual vs Predicted rates</CardDescription>
          </div>
          <div className="text-right space-y-1">
            <div className={cn(
              "text-sm font-mono font-semibold",
              isActualPositive ? "text-emerald-500" : "text-rose-500"
            )}>
              {actualRate ? `${isActualPositive ? '+' : ''}${(actualRate * 100).toFixed(4)}%` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground">
              Actual Rate
            </div>
            {predictedRate && (
              <>
                <div className={cn(
                  "text-xs font-mono",
                  isPredictedPositive ? "text-emerald-400" : "text-rose-400"
                )}>
                  {`${isPredictedPositive ? '+' : ''}${(predictedRate * 100).toFixed(4)}%`}
                </div>
                <div className="text-xs text-muted-foreground">
                  Predicted
                </div>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full">
          <ChartContainer config={chartConfig}>
            <LineChart data={data.combinedHistorical}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                interval="preserveStartEnd"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => value.slice(0, 5)} // Show HH:MM
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
                labelFormatter={(label) => `Time: ${label}`}
              />
              <ChartLegend content={<ChartLegendContent />} />
              {/* Actual funding rate line */}
              <Line
                type="monotone"
                dataKey="actualRate"
                stroke="var(--color-actualRate)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--color-actualRate)", strokeWidth: 2 }}
                name="actualRate"
              />
              {/* Predicted funding rate line */}
              <Line
                type="monotone"
                dataKey="predictedRate"
                stroke="var(--color-predictedRate)"
                strokeWidth={2}
                strokeDasharray="5 5" // Dashed line for prediction
                dot={false}
                activeDot={{ r: 4, stroke: "var(--color-predictedRate)", strokeWidth: 2 }}
                name="predictedRate"
              />
            </LineChart>
          </ChartContainer>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Funding rate {isUpTrend ? 'increased' : 'decreased'} by {Math.abs(actualTrend * 100).toFixed(4)}%
          {isUpTrend ? (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-rose-500" />
          )}
        </div>
        <div className="flex gap-2 leading-none text-muted-foreground">
          <Target className="h-4 w-4" />
          Prediction accuracy: {accuracy.toFixed(1)}%
        </div>
        <div className="text-muted-foreground leading-none">
          {isActualPositive ? 'Longs pay shorts' : 'Shorts pay longs'} • Solid line: actual, Dashed: predicted
        </div>
      </CardFooter>
    </Card>
  );
}