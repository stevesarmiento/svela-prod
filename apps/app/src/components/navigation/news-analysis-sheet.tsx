import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@v1/ui/sheet"
import { Button } from "@v1/ui/button"
import { IconNewspaper } from "symbols-react"
import { TokenNewsAnalysis } from '@/app/[locale]/(dashboard)/charts/[id]/token-news-analysis'

interface TokenData {
  name: string
  symbol: string
}

interface NewsAnalysisSheetProps {
  tokenData: TokenData
}

export function NewsAnalysisSheet({ tokenData }: NewsAnalysisSheetProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 hover:bg-primary/5 rounded-xl"
        >
          <IconNewspaper className="h-4 w-4 fill-white/70 hover:fill-white transition-colors" />
          <span className="sr-only">View Market News</span>
        </Button>
      </SheetTrigger>
      <SheetContent 
        side="right" 
        className="bg-zinc-900 border-zinc-800 p-6 overflow-y-auto"
      >
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg font-medium">Market News & Sentiment</SheetTitle>
        </SheetHeader>
        <TokenNewsAnalysis tokenData={tokenData} />
      </SheetContent>
    </Sheet>
  )
} 