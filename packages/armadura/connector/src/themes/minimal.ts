import type { ConnectorTheme } from './types'

// Clean, minimal light theme
export const minimalTheme: ConnectorTheme = {
  colors: {
    primary: '#111827',
    secondary: '#F3F4F6',
    background: '#FFFFFF',
    surface: '#F9FAFB',
    text: '#111827',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    error: '#DC2626',
    warning: '#D97706',
    success: '#059669',
    accent: '#3B82F6',
    modalOverlay: 'rgba(17, 24, 39, 0.5)',
  },
  
  fonts: {
    body: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Monaco, Consolas, Liberation Mono, Courier New, monospace',
  },
  
  borderRadius: {
    sm: 4,
    md: 6,
    lg: 12,
  },
  
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 4px 8px rgba(0, 0, 0, 0.08)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.12)',
    xl: '0 16px 32px rgba(0, 0, 0, 0.16)',
  },
  
  spacing: {
    xs: 6,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
  },
  
  button: {
    height: 44,
    shadow: 'sm',
    border: '1px solid #E5E7EB',
  },
  
  mode: 'light',
  name: 'Minimal',
}
