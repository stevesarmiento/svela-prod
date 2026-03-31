'use client'

import { useMemo, type DependencyList } from 'react'

/**
 * Hook to properly handle derived state calculations
 * Replaces useEffect patterns for transforming data for rendering
 * 
 * Example AVOID:
 * const [transformedData, setTransformedData] = useState([])
 * useEffect(() => {
 *   setTransformedData(rawData.map(transform))
 * }, [rawData])
 * 
 * Example USE:
 * const transformedData = useDerivedState(
 *   () => rawData.map(transform),
 *   [rawData]
 * )
 */
export function useDerivedState<T>(
  compute: () => T,
  dependencies: DependencyList
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(compute, [compute, ...dependencies])
}

/**
 * Hook for expensive computations with proper memoization
 * Use this when the computation is truly expensive and should be cached
 * Note: Spread element in deps is intentional for dynamic dependency arrays
 */
export function useExpensiveComputation<T>(
  compute: () => T,
  dependencies: DependencyList
): T {
  return useMemo(() => {
    return compute()
  }, [compute, ...dependencies])
}

/**
 * Hook for conditional derived state
 * Handles cases where derived state depends on conditions
 */
export function useConditionalDerivedState<T>(
  condition: boolean,
  compute: () => T,
  fallback: T,
  dependencies: DependencyList
): T {
  return useMemo(() => {
    return condition ? compute() : fallback
  }, [condition, compute, fallback, ...dependencies])
}
