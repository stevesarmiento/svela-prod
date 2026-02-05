// Cached dynamic import for `lightweight-charts` so it stays out of the initial bundle.
// Call this inside client-only code paths (e.g. useEffect) before using runtime exports.

export type LightweightChartsModule = typeof import('lightweight-charts')

let modulePromise: Promise<LightweightChartsModule> | null = null

export function loadLightweightCharts(): Promise<LightweightChartsModule> {
  if (!modulePromise) modulePromise = import('lightweight-charts')
  return modulePromise
}

