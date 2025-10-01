import type { ConnectorTheme } from './types'

// Phantom wallet inspired theme with purple gradients
export const phantomTheme: ConnectorTheme = {
  colors: {
    primary: '#AB9FF2', // Phantom purple
    secondary: '#161B33', // Phantom dark blue
    background: '#0E0E12',
    surface: '#1D1E2C',
    text: '#FFFFFF',
    textSecondary: '#8F9BB3',
    border: '#2D3748',
    error: '#FF6B6B',
    warning: '#FFD93D',
    success: '#6BCF7F',
    accent: '#7C3AED', // Deep purple accent
    modalOverlay: 'rgba(14, 14, 18, 0.85)',
  },
  
  fonts: {
    body: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif',
    mono: 'Fira Code, JetBrains Mono, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
  },
  
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 20,
  },
  
  shadows: {
    sm: '0 2px 4px rgba(171, 159, 242, 0.1)',
    md: '0 8px 16px rgba(171, 159, 242, 0.15)',
    lg: '0 16px 32px rgba(171, 159, 242, 0.2)',
    xl: '0 24px 48px rgba(171, 159, 242, 0.25)',
  },
  
  spacing: {
    xs: 8,
    sm: 12,
    md: 18,
    lg: 24,
    xl: 36,
  },
  
  button: {
    height: 52,
    shadow: 'lg',
    border: 'none',
  },
  
  mode: 'dark',
  name: 'Phantom',
}
