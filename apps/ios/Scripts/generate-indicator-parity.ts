// From the repository root:
// bun --tsconfig-override apps/app/tsconfig.json apps/ios/scripts/generate-indicator-parity.ts
// Golden outputs come directly from the web token page's calculation functions/configs.
import { computeMarketVisionB } from '../../app/src/hooks/market-vision/market-vision-compute';
import { calculateBollingerBands } from '../../app/src/hooks/market-vision/bollinger-bands';
import { calculateBBWP } from '../../app/src/hooks/market-vision/bbwp';
import { calculateRsiDivergences } from '../../app/src/hooks/market-vision/rsi-divergences';
import { makeFixtureBars } from '../../app/src/hooks/market-vision/test-fixtures';
const cases = [
  { name: 'swings-42', bars: makeFixtureBars(400, 42) },
  { name: 'swings-7', bars: makeFixtureBars(400, 7) },
  { name: 'short', bars: makeFixtureBars(10, 42) },
  { name: 'flat', bars: makeFixtureBars(120, 42).map(p => ({ ...p, open: 100, high: 100, low: 100, close: 100, volume: 0 })) },
  { name: 'empty', bars: [] },
];
const points = (p: Array<{time: number; value: number}>) => p.map(p => [p.time, Number.isFinite(p.value) ? p.value : null]);
const output = cases.map(({name, bars}) => {
  const mv = computeMarketVisionB(bars);
  const bb = calculateBollingerBands(bars, { bbLength: 20 });
  const bw = calculateBBWP(bars, { basisLength: 7, lookback: 100, maLength: 5, extremeHigh: 98, extremeLow: 2 });
  const rsi = calculateRsiDivergences(bars);
  const series: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mv.series)) series[`mv.${key}`] = points(value);
  for (const key of ['indicator', 'basis', 'upper', 'lower', 'overboughtBreaches', 'oversoldBreaches'] as const) series[`bb.${key}`] = points(bb[key]);
  for (const key of ['bbwp', 'ma'] as const) series[`bw.${key}`] = points(bw[key]);
  for (const key of ['rsiSeries', 'signalSeries'] as const) series[`rsi.${key}`] = points(rsi[key]);
  series['rsi.reverseLevels'] = rsi.reverseLevels.map(p => [p.target, p.price]);
  series['rsi.signalCurrent'] = [[0, rsi.signalCurrent]];
  series['rsi.reverseSignalCross'] = [[0, rsi.reverseSignalCross]];
  const events = Object.fromEntries(Object.entries(mv.events).map(([key, value]) => [key, value.map(p => p.index)]));
  const divergences = Object.fromEntries([
    ...Object.entries(mv.divergences).map(([key, value]) => [`mv.${key}`, value]),
    ['rsi', rsi.divergences],
  ]);
  return { name, bars, series, events, divergences, pivots: rsi.pivots, alerts: rsi.alerts };
});
await Bun.write(new URL('../Packages/AggrCore/Tests/AggrCoreTests/Fixtures/indicator-web-parity.json', import.meta.url), JSON.stringify(output));
