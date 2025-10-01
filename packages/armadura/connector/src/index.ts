// Initialize UI global styles (e.g., spinner keyframes) once per app
export { injectArcConnectorGlobalStyles } from './ui/global-styles'

// Configuration helpers
export { getDefaultConfig, getDefaultMobileConfig } from './config'
export type { DefaultConfigOptions } from './config'

// Core exports
export { ConnectorClient, modalRoutes, validateRoute, safeRoutes } from './lib/connector-client'
export type { 
  ConnectorState, 
  ConnectorConfig, 
  WalletInfo, 
  AccountInfo,
  ModalRoute
} from './lib/connector-client'

// React exports
export { ConnectorProvider, useConnector, useConnectorClient } from './ui/connector-provider'
export type { ConnectorSnapshot } from './ui/connector-provider'
export type { MobileWalletAdapterConfig } from './ui/connector-provider'
export { UnifiedProvider, AppProvider, WalletProvider } from './ui/unified-provider'
export type { UnifiedProviderProps } from './ui/unified-provider'

// Hooks
export { useModal } from './hooks'
export type { UseModalReturn } from './hooks'

// UI exports  
export { ConnectButton } from './ui/connect-button'
export type { ConnectButtonProps } from './ui/connect-button'
export { ConnectModal } from './ui/connect-modal'

// Pages for custom implementations
export { WalletsPage } from './pages/wallets'

// Theming system
export {
  themes,
  solanaTheme,
  minimalTheme, 
  darkTheme,
  phantomTheme,
  defaultConnectorTheme,
  // Theme utilities
  getBorderRadius,
  getSpacing,
  getButtonHeight,
  getButtonShadow,
  getButtonBorder,
  getAccessibleTextColor,
  mergeThemeOverrides,
  // Legacy compatibility
  getBorderRadiusLegacy,
  getButtonHeightLegacy,
  getButtonShadowLegacy,
  getButtonBorderLegacy,
  legacyToModernTheme,
} from './themes'
export type { 
  ConnectorTheme,
  LegacyConnectorTheme,
  ConnectorThemeOverrides,
  LegacyConnectorThemeOverrides,
  ThemeName
} from './themes'

// Configuration types
export type { 
  ConnectorOptions, 
  MobileConnectorOptions, 
  ConnectorThemeExtended 
} from './types'

// Wallet registry
export { 
  solanaWallets,
  getPopularWallets,
  getMobileWallets,
  getWalletByIdentifier,
  getAllWallets
} from './wallets'
export type { SolanaWalletConfig } from './wallets'

// Optional programmatic registration helper
export async function registerMobileWalletAdapter(config: import('./ui/connector-provider').MobileWalletAdapterConfig) {
  const {
    registerMwa,
    createDefaultAuthorizationCache,
    createDefaultChainSelector,
    createDefaultWalletNotFoundHandler,
    MWA_SOLANA_CHAINS,
  } = (await import('@solana-mobile/wallet-standard-mobile')) as any
  registerMwa({
    appIdentity: config.appIdentity,
    authorizationCache: config.authorizationCache ?? createDefaultAuthorizationCache(),
    chains: (config.chains ?? MWA_SOLANA_CHAINS) as any,
    chainSelector: config.chainSelector ?? createDefaultChainSelector(),
    remoteHostAuthority: config.remoteHostAuthority,
    onWalletNotFound: config.onWalletNotFound ?? createDefaultWalletNotFoundHandler(),
  })
}