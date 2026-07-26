'use client'

export function useIsomorphicTheme() {
  return {
    isDarkMode: true,
    resolvedTheme: "dark",
    theme: "dark",
    mounted: true,
  } as const
}
