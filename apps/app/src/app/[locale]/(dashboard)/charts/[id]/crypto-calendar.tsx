import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@v1/ui/table"
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'

interface CryptoCalendarProps {
  tokenId: string
}

export function CryptoCalendar({ tokenId }: CryptoCalendarProps) {
  // This would typically come from an API
  const events = [
    {
      metric: 'Trading Volume',
      previous: '2.1B',
      actual: '2.4B',
      forecast: '2.2B',
      trend: 'up',
      time: '24h',
    },
    {
      metric: 'Active Addresses',
      previous: '125K',
      actual: '118K',
      forecast: '122K',
      trend: 'down',
      time: '24h',
    },
    {
      metric: 'Network Hash Rate',
      previous: '245 EH/s',
      actual: '248 EH/s',
      forecast: '247 EH/s',
      trend: 'up',
      time: '24h',
    },
    {
      metric: 'Exchange Inflow',
      previous: '12.5K',
      actual: '12.5K',
      forecast: '13K',
      trend: 'neutral',
      time: '24h',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Network Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Previous</TableHead>
              <TableHead>Actual</TableHead>
              <TableHead>Forecast</TableHead>
              <TableHead>Trend</TableHead>
              <TableHead className="text-right">Time Frame</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.metric}>
                <TableCell className="font-medium">{event.metric}</TableCell>
                <TableCell>{event.previous}</TableCell>
                <TableCell>{event.actual}</TableCell>
                <TableCell>{event.forecast}</TableCell>
                <TableCell>
                  {event.trend === 'up' && <ArrowUp className="h-4 w-4 text-green-500" />}
                  {event.trend === 'down' && <ArrowDown className="h-4 w-4 text-red-500" />}
                  {event.trend === 'neutral' && <Minus className="h-4 w-4 text-yellow-500" />}
                </TableCell>
                <TableCell className="text-right">{event.time}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

