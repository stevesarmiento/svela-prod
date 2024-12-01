import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { cn } from "@v1/ui/cn"
import { Table, TableBody, TableCell, TableRow } from "@v1/ui/table"
import { formatLargeNumber } from "@v1/ui/format-numbers"
import { 
  IconDollarsign, 
  IconChartBarXaxis, 
  IconTrophyFill, 
  IconTarget, 
  IconInfinity, 
  IconChartLineUptrendXyaxis 
} from "symbols-react"

interface MarketMetricsProps {
  data: {
    quote: {
      USD: {
        price: number
        volume_24h: number
        market_cap: number
        percent_change_24h: number
      }
    }
    cmc_rank: number
    circulating_supply: number
    max_supply: number | null
    symbol: string
  }
}

export function MarketMetrics({ data }: MarketMetricsProps) {
  const metrics: { label: string; value: string; className?: string; icon: React.ReactNode }[] = [
    { 
      label: 'Market Cap', 
      value: `$${formatLargeNumber(data.quote.USD.market_cap)}`,
      icon: <IconDollarsign className="h-4 w-4 fill-muted-foreground" />
    },
    { 
      label: '24h Volume', 
      value: `$${formatLargeNumber(data.quote.USD.volume_24h)}`,
      icon: <IconChartBarXaxis className="h-4 w-4 fill-muted-foreground" />
    },
    { 
      label: 'CMC Rank', 
      value: `#${data.cmc_rank}`,
      icon: <IconTrophyFill className="h-4 w-4 fill-muted-foreground" />
    },
    { 
      label: 'Circulating Supply', 
      value: `${data.circulating_supply.toLocaleString()} ${data.symbol}`,
      icon: <IconTarget className="h-4 w-4 fill-muted-foreground" />
    },
    { 
      label: 'Max Supply', 
      value: data.max_supply ? `${data.max_supply.toLocaleString()} ${data.symbol}` : 'Unlimited',
      icon: <IconInfinity className="h-4 w-4 fill-muted-foreground" />
    },
    { 
      label: '24h Change', 
      value: `${data.quote.USD.percent_change_24h.toFixed(2)}%`,
      className: data.quote.USD.percent_change_24h > 0 ? 'text-green-600' : 'text-red-600',
      icon: <IconChartLineUptrendXyaxis className="h-4 w-4 fill-muted-foreground" />
    },
  ]

  return (
    <Card>
      <CardHeader className="border-b border-foreground/10 pb-4 pt-6">
        <CardTitle className="font-mono">Market Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <Table className="[&_tr:last-child]:border-0 font-mono border-0 mt-4">
          <TableBody className="border-0">
            {metrics.map((metric, index) => (
              <TableRow 
                key={metric.label}
                className={cn(
                  "border-0",
                  index % 2 === 0 ? "bg-transparent" : "bg-white/5"
                )}
              >
                <TableCell className="font-medium border-0">
                  <div className="flex flex-row items-center gap-2">
                    {metric.icon}
                    <span className="opacity-60">{metric.label}</span>
                  </div>
                </TableCell>
                <TableCell className={cn("text-right border-0", metric.className)}>
                  {metric.value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}