import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { Table, TableBody, TableCell, TableRow } from "@v1/ui/table"

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
  const metrics = [
    { 
      label: 'Market Cap', 
      value: `$${data.quote.USD.market_cap.toLocaleString()}` 
    },
    { 
      label: '24h Volume', 
      value: `$${data.quote.USD.volume_24h.toLocaleString()}` 
    },
    { 
      label: 'CMC Rank', 
      value: `#${data.cmc_rank}` 
    },
    { 
      label: 'Circulating Supply', 
      value: `${data.circulating_supply.toLocaleString()} ${data.symbol}` 
    },
    { 
      label: 'Max Supply', 
      value: data.max_supply ? `${data.max_supply.toLocaleString()} ${data.symbol}` : 'Unlimited' 
    },
    { 
      label: '24h Change', 
      value: `${data.quote.USD.percent_change_24h.toFixed(2)}%` 
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {metrics.map((metric) => (
              <TableRow key={metric.label}>
                <TableCell className="font-medium">{metric.label}</TableCell>
                <TableCell>{metric.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}