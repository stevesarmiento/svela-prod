import { Fragment } from "react"
import { FundingRate } from "./funding-rate"
import { OpenInterest } from "./open-interest"
import { LongShortRatio } from "./long-short-ratio"
import { Liquidations } from "./liquidations"

interface DerivativesMetricsProps {
  data: {
    id: number
    symbol: string
  }
}

export function DerivativesMetrics({ data }: DerivativesMetricsProps) {
  const derivativesComponents = [
    {
      key: 'funding-rate',
      component: <FundingRate cmcId={data.id.toString()} />
    },
    {
      key: 'open-interest', 
      component: <OpenInterest cmcId={data.id.toString()} />
    },
    {
      key: 'long-short-ratio',
      component: <LongShortRatio cmcId={data.id.toString()} />
    },
    {
      key: 'liquidations',
      component: <Liquidations cmcId={data.id.toString()} />  
    }
  ]

  return (
    <div className="grid grid-cols-1 items-center">
      {derivativesComponents.map((item, index) => (
        <Fragment key={item.key}>
          <div className="col-span-1">
            {item.component}
          </div>
          
          {/* Separator - only between items, not after the last one */}
          {index < derivativesComponents.length - 1 && (
            <div className="flex justify-center col-span-1">
              <div className="h-[77px] w-[1px] bg-gradient-to-b from-transparent via-foreground/20 to-transparent" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}