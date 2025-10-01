import type { ConnectorTheme } from './types'

// Classic dark theme
export const darkTheme: ConnectorTheme = {
  colors: {
    primary: '#FFFFFF',
    secondary: '#1F2937',
    background: '#111827',
    surface: '#1F2937',
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    border: '#374151',
    error: '#F87171',
    warning: '#FBBF24',
    success: '#34D399',
    accent: '#60A5FA',
    modalOverlay: 'rgba(0, 0, 0, 0.75)',
  },
  
  fonts: {
    body: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Monaco, Consolas, Liberation Mono, Courier New, monospace',
  },
  
  borderRadius: {
    sm: 6,
    md: 8,
    lg: 12,
  },
  
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.2)',
    md: '0 4px 12px rgba(0, 0, 0, 0.3)',
    lg: '0 10px 24px rgba(0, 0, 0, 0.4)',
    xl: '0 20px 40px rgba(0, 0, 0, 0.5)',
  },
  
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
  },
  
  button: {
    height: 48,
    shadow: 'md',
    border: '1px solid #374151',
  },
  
  mode: 'dark',
  name: 'Dark',
}
