import type { ConnectorTheme } from './types'

// Official Solana brand colors and theme
export const solanaTheme: ConnectorTheme = {
  colors: {
    primary: '#9945FF', // Solana purple
    secondary: '#14F195', // Solana green
    background: '#000000',
    surface: '#1A1A1A',
    text: '#FFFFFF',
    textSecondary: '#9CA3AF',
    border: '#374151',
    error: '#EF4444',
    warning: '#F59E0B',
    success: '#14F195', // Solana green
    accent: '#00FFA3', // Solana accent green
    modalOverlay: 'rgba(0, 0, 0, 0.8)',
  },
  
  fonts: {
    body: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji',
    mono: 'JetBrains Mono, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
  },
  
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 16,
  },
  
  shadows: {
    sm: '0 1px 2px rgba(153, 69, 255, 0.1)',
    md: '0 4px 12px rgba(153, 69, 255, 0.15)',
    lg: '0 10px 24px rgba(153, 69, 255, 0.2)',
    xl: '0 20px 40px rgba(153, 69, 255, 0.25)',
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
    border: '2px solid transparent',
  },
  
  mode: 'dark',
  name: 'Solana',
}
