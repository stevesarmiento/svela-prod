import { useEffect, useState, useCallback } from "react"
import { Effect, Exit, Cause } from "effect"

export interface EffectHookResult<A, E> {
  data: A | null
  error: E | null
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  refetch: () => void
}

export function useEffectResult<A, E>(
  makeEffect: () => Effect.Effect<A, E>,
  deps: any[] = []
): EffectHookResult<A, E> {
  const [state, setState] = useState<{
    data: A | null
    error: E | null
    isLoading: boolean
    isSuccess: boolean
    isError: boolean
  }>({
    data: null,
    error: null,
    isLoading: true,
    isSuccess: false,
    isError: false
  })
  
  const [refetchKey, setRefetchKey] = useState(0)
  
  useEffect(() => {
    setState(prev => ({ ...prev, isLoading: true }))
    
    const program = makeEffect()
    
    Effect.runPromiseExit(program).then((exit) => {
      if (Exit.isSuccess(exit)) {
        setState({
          data: exit.value,
          error: null,
          isLoading: false,
          isSuccess: true,
          isError: false
        })
      } else {
        const cause = Cause.pretty(exit.cause)
        setState({
          data: null,
          error: cause as E,
          isLoading: false,
          isSuccess: false,
          isError: true
        })
      }
    })
  }, [...deps, refetchKey])
  
  const refetch = useCallback(() => {
    setRefetchKey(k => k + 1)
  }, [])
  
  return { ...state, refetch }
}

