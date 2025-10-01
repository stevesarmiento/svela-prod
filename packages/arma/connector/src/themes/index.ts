// Theme types
export type { 
  ConnectorTheme, 
  LegacyConnectorTheme, 
  ConnectorThemeOverrides, 
  LegacyConnectorThemeOverrides 
} from './types'

// Pre-built themes
export { solanaTheme } from './solana'
export { minimalTheme } from './minimal'
export { darkTheme } from './dark'
export { phantomTheme } from './phantom'

// Import themes for internal use
import { solanaTheme } from './solana'
import { minimalTheme } from './minimal'
import { darkTheme } from './dark'
import { phantomTheme } from './phantom'

// Theme utilities
export {
  getValue,
  getBorderRadius,
  getSpacing,
  getButtonHeight,
  getButtonShadow,
  getButtonBorder,
  getAccessibleTextColor,
  mergeThemeOverrides,
  legacyToModernTheme,
  // Legacy compatibility exports
  getBorderRadiusLegacy,
  getButtonHeightLegacy,
  getButtonShadowLegacy,
  getButtonBorderLegacy,
} from './utils'

// Default themes collection
export const themes = {
  solana: solanaTheme,
  minimal: minimalTheme,
  dark: darkTheme,
  phantom: phantomTheme,
} as const

// Default theme (backwards compatible)
export const defaultConnectorTheme = minimalTheme

// Theme name type for convenience
export type ThemeName = keyof typeof themes
