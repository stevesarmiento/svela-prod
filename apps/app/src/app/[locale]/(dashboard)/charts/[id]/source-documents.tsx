import { Card, CardContent, CardHeader, CardTitle } from "@v1/ui/card"
import { FileText } from 'lucide-react'

interface SourceDocumentsProps {
  tokenData: any
}

export function SourceDocuments({ tokenData }: SourceDocumentsProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Source documents</h2>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="font-semibold">CoinGecko API Data</div>
              <div className="text-sm text-muted-foreground">
                Last updated: {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

