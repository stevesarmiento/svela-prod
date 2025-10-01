import type { ConnectorTheme, LegacyConnectorTheme, ConnectorThemeOverrides, LegacyConnectorThemeOverrides } from './types'

// Utility functions for theme management
export function getValue(value: string | number, fallback: string): string {
  if (typeof value === 'number') return `${value}px`
  return (typeof value === 'string' && value.trim()) ? value : fallback
}

export function getBorderRadius(theme: ConnectorTheme, size: 'sm' | 'md' | 'lg' = 'md'): string {
  return getValue(theme.borderRadius[size], '8px')
}

export function getSpacing(theme: ConnectorTheme, size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md'): string {
  return getValue(theme.spacing[size], '16px')
}

export function getButtonHeight(theme: ConnectorTheme): string {
  return getValue(theme.button.height, '44px')
}

export function getButtonShadow(theme: ConnectorTheme): string {
  const shadow = theme.button.shadow
  if (shadow === 'none') return 'none'
  if (shadow === 'sm') return theme.shadows.sm
  if (shadow === 'md') return theme.shadows.md
  if (shadow === 'lg') return theme.shadows.lg
  return String(shadow)
}

export function getButtonBorder(theme: ConnectorTheme): string {
  return theme.button.border === 'none' ? '1.5px solid transparent' : String(theme.button.border)
}

export function getAccessibleTextColor(hexColor: string): string {
  try {
    // Validate hex color input
    if (!hexColor || typeof hexColor !== 'string') {
      throw new Error('Invalid hex color input')
    }

    const c = hexColor.replace('#', '')

    // Validate hex string length and characters
    if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(c)) {
      throw new Error('Invalid hex color format')
    }

    const bigint = parseInt(
      c.length === 3 ? c.split('').map(x => x + x).join('') : c,
      16
    )
    const r = (bigint >> 16) & 255
    const g = (bigint >> 8) & 255
    const b = bigint & 255
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    return luminance > 0.55 ? '#111827' : '#ffffff'
  } catch {
    // Return dark text as safer default for unknown backgrounds
    return '#111827'
  }
}

// Merge theme overrides
export function mergeThemeOverrides(base: ConnectorTheme, overrides: ConnectorThemeOverrides): ConnectorTheme {
  return {
    ...base,
    colors: { ...base.colors, ...overrides.colors },
    fonts: { ...base.fonts, ...overrides.fonts },
    borderRadius: { ...base.borderRadius, ...overrides.borderRadius },
    shadows: { ...base.shadows, ...overrides.shadows },
    spacing: { ...base.spacing, ...overrides.spacing },
    button: { ...base.button, ...overrides.button },
    mode: overrides.mode ?? base.mode,
    name: overrides.name ?? base.name,
  }
}

// Convert legacy theme to new theme format
export function legacyToModernTheme(legacy: LegacyConnectorTheme): ConnectorTheme {
  const isLight = legacy.primaryColor === '#FFFFFF' || legacy.primaryColor.toLowerCase() === '#ffffff'
  
  return {
    colors: {
      primary: legacy.primaryColor,
      secondary: legacy.secondaryColor,
      background: isLight ? '#FFFFFF' : '#111827',
      surface: isLight ? '#F9FAFB' : '#1F2937',
      text: isLight ? '#111827' : '#F9FAFB',
      textSecondary: isLight ? '#6B7280' : '#9CA3AF',
      border: isLight ? '#E5E7EB' : '#374151',
      error: isLight ? '#DC2626' : '#F87171',
      warning: isLight ? '#D97706' : '#FBBF24',
      success: isLight ? '#059669' : '#34D399',
      accent: '#3B82F6',
      modalOverlay: isLight ? 'rgba(17, 24, 39, 0.5)' : 'rgba(0, 0, 0, 0.75)',
    },
    fonts: {
      body: legacy.fontFamily,
      mono: 'ui-monospace, SFMono-Regular, Monaco, Consolas, Liberation Mono, Courier New, monospace',
    },
    borderRadius: {
      sm: legacy.borderRadius,
      md: legacy.borderRadius,
      lg: legacy.borderRadius,
    },
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
      md: '0 4px 8px rgba(0, 0, 0, 0.08)',
      lg: '0 8px 16px rgba(0, 0, 0, 0.12)',
      xl: '0 16px 32px rgba(0, 0, 0, 0.16)',
    },
    spacing: {
      xs: 8,
      sm: 12,
      md: 16,
      lg: 24,
      xl: 32,
    },
    button: {
      height: legacy.height,
      shadow: legacy.buttonShadow,
      border: legacy.border,
    },
    mode: isLight ? 'light' : 'dark',
    name: 'Legacy',
  }
}

// Backwards compatibility helper functions
export function getBorderRadiusLegacy(value: ConnectorTheme['borderRadius']['md']): string {
  return getValue(value, '8px')
}

export function getButtonHeightLegacy(value: ConnectorTheme['button']['height']): string {
  return getValue(value, '44px')
}

export function getButtonShadowLegacy(value: ConnectorTheme['button']['shadow']): string {
  if (value === 'none') return 'none'
  if (value === 'sm') return '0 1px 2px rgba(0,0,0,0.04)'
  if (value === 'md') return '0 4px 12px rgba(0,0,0,0.08)'
  if (value === 'lg') return '0 10px 24px rgba(0,0,0,0.12)'
  return String(value)
}

export function getButtonBorderLegacy(value: ConnectorTheme['button']['border']): string {
  return value === 'none' ? '1.5px solid transparent' : String(value)
}
