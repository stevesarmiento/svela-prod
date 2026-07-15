import React from 'react';
import { IconCalendar } from 'symbols-react';
import { formatUsdPrice, formatUsdVolume } from '../utils';

export interface ChartTooltipOhlcData {
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface ChartTooltipProps {
    price: number;
    percentageChange: number;
    timestampMs: number;
    volume?: number;
    marketCap?: number;
    ohlcData?: ChartTooltipOhlcData;
}

export function ChartTooltip({ price, percentageChange, timestampMs, volume, marketCap, ohlcData }: ChartTooltipProps) {
    return (
        <div className="flex flex-col gap-1 overflow-hidden">
            <div className="px-3 py-2">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] text-white/80 font-medium">
                    <IconCalendar className="w-3 h-3 fill-white/50" />
                    {new Date(timestampMs).toLocaleDateString(undefined, {
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </div>

                <div className="w-full scale-x-120 h-[1px] mb-2 bg-white/10" />

                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] text-white/80">Price</span>
                        <div className="flex items-center gap-2">
                            <span
                                className={`text-[10px] font-berkeley-mono px-1.5 py-0.5 rounded ${
                                    percentageChange >= 0
                                        ? 'bg-green-500/20 text-green-400'
                                        : 'bg-red-500/20 text-red-400'
                                }`}
                            >
                                {`${(percentageChange > 0 ? '+' : '') + percentageChange.toFixed(2)}%`}
                            </span>
                            <span className="text-[11px] font-berkeley-mono font-bold text-white">
                                {formatUsdPrice(price)}
                            </span>
                        </div>
                    </div>

                    {marketCap !== undefined && (
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] text-white/80">Market cap</span>
                            <span className="text-[11px] font-berkeley-mono text-white">{formatUsdVolume(marketCap)}</span>
                        </div>
                    )}

                    {volume !== undefined && (
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] text-white/80">Volume (USD)</span>
                            <span className="text-[11px] font-berkeley-mono text-white">{formatUsdVolume(volume)}</span>
                        </div>
                    )}

                    {ohlcData && (
                        <>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-white/80">Open</span>
                                <span className="text-[11px] font-berkeley-mono text-white">
                                    {formatUsdPrice(ohlcData.open)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-white/80">High</span>
                                <span className="text-[11px] font-berkeley-mono text-green-400">
                                    {formatUsdPrice(ohlcData.high)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-white/80">Low</span>
                                <span className="text-[11px] font-berkeley-mono text-red-400">
                                    {formatUsdPrice(ohlcData.low)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-white/80">Close</span>
                                <span className="text-[11px] font-berkeley-mono text-white">
                                    {formatUsdPrice(ohlcData.close)}
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
