"use client";

import { useLiquidationHistory } from "@/hooks/use-liquidation-history";
import { Skeleton } from "@v1/ui/skeleton";
import { formatLargeNumber } from "@v1/ui/format-numbers";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

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

interface LiquidationsProps {
  cmcId: string;
}

const chartConfig = {
  longLiquidations: {
    label: "Long Liquidations",
    color: "#ef4444", // Red for longs getting rekt
  },
  shortLiquidations: {
    label: "Short Liquidations", 
    color: "#10b981", // Green for shorts getting rekt
  },
} satisfies ChartConfig;

export function Liquidations({ cmcId }: LiquidationsProps) {
  const { data, isLoading, error } = useLiquidationHistory({ symbol: cmcId });

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm font-medium">24h Liquidations</CardTitle>
          <CardDescription>Loading liquidation data...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data || !data.data?.length) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm font-medium">24h Liquidations</CardTitle>
          <CardDescription>No liquidation data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center text-muted-foreground">
            No liquidation data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform data for stacked bar chart
  const chartData = data.data.map((item) => {
    const date = new Date(item.timestamp * 1000);
    const timeLabel = date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    return {
      time: timeLabel,
      timestamp: item.timestamp,
      longLiquidations: Math.round(item.longLiquidations / 1000), // Convert to thousands
      shortLiquidations: Math.round(item.shortLiquidations / 1000),
      // Keep original values for calculations
      longOriginal: item.longLiquidations,
      shortOriginal: item.shortLiquidations,
    };
  });

  // Calculate totals and trends
  const totalLongs = data.data.reduce((sum, item) => sum + item.longLiquidations, 0);
  const totalShorts = data.data.reduce((sum, item) => sum + item.shortLiquidations, 0);
  const grandTotal = totalLongs + totalShorts;
  const dominantSide = totalLongs > totalShorts ? "Longs" : "Shorts";
  const dominantPercentage = totalLongs > totalShorts 
    ? ((totalLongs / grandTotal) * 100).toFixed(1)
    : ((totalShorts / grandTotal) * 100).toFixed(1);

  // Find peak liquidation hour
  const peakHour = chartData.reduce((max, current) => 
    (current.longOriginal + current.shortOriginal) > (max.longOriginal + max.shortOriginal) 
      ? current 
      : max
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-sm font-medium">24h Liquidations</CardTitle>
        <CardDescription>
          Long vs Short liquidations by hour • Total: ${formatLargeNumber(grandTotal)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
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
              tickFormatter={(value) => `${value}k`}
            />
            <ChartTooltip 
              content={<ChartTooltipContent hideLabel />}
              cursor={false}
              formatter={(value: number, name: string) => [
                `$${formatLargeNumber((value as number) * 1000)}`,
                chartConfig[name as keyof typeof chartConfig]?.label || name
              ]}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="longLiquidations"
              stackId="liquidations"
              fill="var(--color-longLiquidations)"
              radius={[0, 0, 4, 4]}
            />
            <Bar
              dataKey="shortLiquidations"
              stackId="liquidations"
              fill="var(--color-shortLiquidations)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          {dominantSide} got rekt more ({dominantPercentage}% of total)
          {totalLongs > totalShorts ? (
            <TrendingDown className="h-4 w-4 text-rose-500" />
          ) : (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          )}
        </div>
        <div className="text-muted-foreground leading-none">
          Peak liquidations at {peakHour.time} • ${formatLargeNumber(peakHour.longOriginal + peakHour.shortOriginal)}
        </div>
        
        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-3 gap-4 text-center w-full">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Total 24h</div>
            <div className="font-berkeley-mono text-sm font-semibold">
              ${formatLargeNumber(grandTotal)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Longs Rekt</div>
            <div className="font-berkeley-mono text-sm font-semibold text-rose-500">
              ${formatLargeNumber(totalLongs)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Shorts Rekt</div>
            <div className="font-berkeley-mono text-sm font-semibold text-emerald-500">
              ${formatLargeNumber(totalShorts)}
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
} 