// Solana wallet configurations with metadata, download links, and capabilities
export interface SolanaWalletConfig {
  /** Wallet name */
  name: string
  /** Short name for display */
  shortName?: string
  /** Wallet icon URL or React component */
  icon?: string
  /** Wallet identifier (often the rdns from wallet standard) */
  identifier?: string
  /** Download/install URLs */
  downloadUrls?: {
    website?: string
    chrome?: string
    firefox?: string
    edge?: string
    safari?: string
    ios?: string
    android?: string
    desktop?: string
  }
  /** Mobile deep link generator */
  mobileDeepLink?: (uri: string) => string
  /** Supported Solana features */
  capabilities?: {
    supportsVersionedTransactions?: boolean
    supportsSignAndSendTransaction?: boolean
    supportsSignTransaction?: boolean
    supportsSignMessage?: boolean
    supportsSignIn?: boolean
  }
  /** Popular wallet indicator */
  isPopular?: boolean
  /** Mobile-first wallet */
  isMobile?: boolean
}

// Comprehensive registry of Solana wallets
export const solanaWallets: Record<string, SolanaWalletConfig> = {
  'phantom': {
    name: 'Phantom',
    shortName: 'Phantom',
    identifier: 'app.phantom',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTA4IiBoZWlnaHQ9IjEwOCIgdmlld0JveD0iMCAwIDEwOCAxMDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjU0IiBjeT0iNTQiIHI9IjU0IiBmaWxsPSJ1cmwoI3BhaW50MF9saW5lYXJfNDdfMTIpIi8+CjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNMzYuNSA2My41QzM2LjUgNjMuNSA0NC41IDY5LjUgNTQgNjkuNUM2My41IDY5LjUgNzEuNSA2My41IDcxLjUgNjMuNUM3MS41IDQ5IDcxLjUgMzguNSA1NCAzOC41QzM2LjUgMzguNSAzNi41IDQ5IDM2LjUgNjMuNVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik00NSA1My41QzQ1IDUzLjUgNDcuNSA1MS41IDUxIDUxLjVDNTQuNSA1MS41IDU3IDUzLjUgNTcgNTMuNUw1NyA1OUw0NSA1OVY1My41WiIgZmlsbD0iIzM0MjAzQyIvPgo8cGF0aCBkPSJNNjMgNTMuNUM2MyA1My41IDY1LjUgNTEuNSA2OSA1MS41QzcyLjUgNTEuNSA3NSA1My41IDc1IDUzLjVMNzUgNTlMNjMgNTlWNTMuNVoiIGZpbGw9IiMzNDIwM0MiLz4KPGRlZnM+CjxsaW5lYXJHcmFkaWVudCBpZD0icGFpbnQwX2xpbmVhcl80N18xMiIgeDE9IjEwOCIgeTE9IjUuNzcxMDhlLTA2IiB4Mj0iMS4wODMzNWUtMDUiIHkyPSIxMDgiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KPHN0b3Agc3RvcC1jb2xvcj0iIzUzNDNGNSIvPgo8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNBQjlGRjIiLz4KPC9saW5lYXJHcmFkaWVudD4KPC9kZWZzPgo8L3N2Zz4K',
    downloadUrls: {
      website: 'https://phantom.app',
      chrome: 'https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa',
      firefox: 'https://addons.mozilla.org/en-US/firefox/addon/phantom-app/',
      ios: 'https://apps.apple.com/app/phantom-solana-wallet/id1598432977',
      android: 'https://play.google.com/store/apps/details?id=app.phantom',
    },
    mobileDeepLink: (uri) => `phantom://wc?uri=${encodeURIComponent(uri)}`,
    capabilities: {
      supportsVersionedTransactions: true,
      supportsSignAndSendTransaction: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
      supportsSignIn: true,
    },
    isPopular: true,
  },

  'solflare': {
    name: 'Solflare',
    shortName: 'Solflare',
    identifier: 'com.solflare.wallet',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiByeD0iMTUiIGZpbGw9InVybCgjcGFpbnQwX2xpbmVhcl8yXzEyKSIvPgo8cGF0aCBkPSJNMjAgMjBIMzBWMzBIMjBWMjBaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMzAgMjBINDBWMzBIMzBWMjBaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNNDAgMjBINTBWMzBINDBWMjBaIiBmaWxsPSJ3aGl0ZSIvPgo8ZGVmcz4KPGxpbmVhckdyYWRpZW50IGlkPSJwYWludDBfbGluZWFyXzJfMTIiIHgxPSIwIiB5MT0iMCIgeDI9IjEwMCIgeTI9IjEwMCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgo8c3RvcCBzdG9wLWNvbG9yPSIjRkM5MzIyIi8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI0Y3OTMxQSIvPgo8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM+Cjwvc3ZnPgo=',
    downloadUrls: {
      website: 'https://solflare.com',
      chrome: 'https://chrome.google.com/webstore/detail/solflare-wallet/bhhhlbepdkbapadjdnnojkbgioiodbic',
      firefox: 'https://addons.mozilla.org/en-US/firefox/addon/solflare-wallet/',
      edge: 'https://microsoftedge.microsoft.com/addons/detail/solflare-wallet/gvgmgajhhgdnjkjjmbknppbkkdcgbkbp',
      ios: 'https://apps.apple.com/app/solflare-wallet/id1580902717',
      android: 'https://play.google.com/store/apps/details?id=com.solflare.mobile',
    },
    mobileDeepLink: (uri) => `solflare://wc?uri=${encodeURIComponent(uri)}`,
    capabilities: {
      supportsVersionedTransactions: true,
      supportsSignAndSendTransaction: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
      supportsSignIn: true,
    },
    isPopular: true,
  },

  'backpack': {
    name: 'Backpack',
    shortName: 'Backpack',
    identifier: 'app.backpack',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiByeD0iMTUiIGZpbGw9IiMwRjBGMjMiLz4KPHBhdGggZD0iTTMwIDIwSDcwVjgwSDMwVjIwWiIgZmlsbD0idXJsKCNwYWludDBfbGluZWFyKSIvPgo8ZGVmcz4KPGxpbmVhckdyYWRpZW50IGlkPSJwYWludDBfbGluZWFyIiB4MT0iMzAiIHkxPSIyMCIgeDI9IjcwIiB5Mj0iODAiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KPHN0b3Agc3RvcC1jb2xvcj0iI0UzM0U3RiIvPgo8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNCREJERkYiLz4KPC9saW5lYXJHcmFkaWVudD4KPC9kZWZzPgo8L3N2Zz4K',
    downloadUrls: {
      website: 'https://backpack.app',
      chrome: 'https://chrome.google.com/webstore/detail/backpack/aflkmfhebedbjioipglgcbcmnbpgliof',
      ios: 'https://apps.apple.com/app/backpack-crypto-wallet/id1665746446',
      android: 'https://play.google.com/store/apps/details?id=app.backpack.mobile',
    },
    mobileDeepLink: (uri) => `backpack://wc?uri=${encodeURIComponent(uri)}`,
    capabilities: {
      supportsVersionedTransactions: true,
      supportsSignAndSendTransaction: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
      supportsSignIn: true,
    },
    isPopular: true,
  },

  'glow': {
    name: 'Glow',
    shortName: 'Glow',
    identifier: 'so.glow.wallet',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiByeD0iMTUiIGZpbGw9InVybCgjcGFpbnQwX3JhZGlhbCkiLz4KPGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iMjAiIGZpbGw9IndoaXRlIi8+CjxkZWZzPgo8cmFkaWFsR3JhZGllbnQgaWQ9InBhaW50MF9yYWRpYWwiIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgo8c3RvcCBzdG9wLWNvbG9yPSIjMDBGRkEzIi8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzAwNjQ1QSIvPgo8L3JhZGlhbEdyYWRpZW50Pgo8L2RlZnM+Cjwvc3ZnPgo=',
    downloadUrls: {
      website: 'https://glow.so',
      chrome: 'https://chrome.google.com/webstore/detail/glow-solana-wallet/ojbcfhjlmaamogjgbsonjcnmogkdeojc',
      ios: 'https://apps.apple.com/app/glow-solana-wallet/id1599584512',
      android: 'https://play.google.com/store/apps/details?id=so.glow.app',
    },
    mobileDeepLink: (uri) => `glow://wc?uri=${encodeURIComponent(uri)}`,
    capabilities: {
      supportsVersionedTransactions: true,
      supportsSignAndSendTransaction: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
      supportsSignIn: true,
    },
    isPopular: true,
    isMobile: true,
  },

  'torus': {
    name: 'Torus',
    shortName: 'Torus',
    identifier: 'com.torus.wallet',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiByeD0iMTUiIGZpbGw9IiMwMzY0RkYiLz4KPHBhdGggZD0iTTUwIDIwQzY2IDIwIDc5IDMzIDc5IDUwQzc5IDY3IDY2IDgwIDUwIDgwQzM0IDgwIDIxIDY3IDIxIDUwQzIxIDMzIDM0IDIwIDUwIDIwWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cg==',
    downloadUrls: {
      website: 'https://tor.us',
      chrome: 'https://chrome.google.com/webstore/detail/torus/hhojmcideegphlmgclmlndahjckkbpdf',
    },
    capabilities: {
      supportsVersionedTransactions: false,
      supportsSignAndSendTransaction: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
    },
  },

  'coin98': {
    name: 'Coin98',
    shortName: 'Coin98',
    identifier: 'com.coin98.wallet',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiByeD0iMTUiIGZpbGw9IiNGREQxNkMiLz4KPHBhdGggZD0iTTMwIDMwSDcwVjcwSDMwVjMwWiIgZmlsbD0iIzI5MjkyOSIvPgo8L3N2Zz4K',
    downloadUrls: {
      website: 'https://coin98.com',
      chrome: 'https://chrome.google.com/webstore/detail/coin98-wallet/aeachknmefphepccionboohckonoeemg',
      firefox: 'https://addons.mozilla.org/en-US/firefox/addon/coin98-wallet/',
      ios: 'https://apps.apple.com/app/coin98-super-app/id1561969966',
      android: 'https://play.google.com/store/apps/details?id=coin98.crypto.finance.media',
    },
    mobileDeepLink: (uri) => `coin98://wc?uri=${encodeURIComponent(uri)}`,
    capabilities: {
      supportsVersionedTransactions: true,
      supportsSignAndSendTransaction: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
    },
  },

  'slope': {
    name: 'Slope',
    shortName: 'Slope',
    identifier: 'so.slope.wallet',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiByeD0iMTUiIGZpbGw9InVybCgjcGFpbnQwX2xpbmVhcikiLz4KPHBhdGggZD0iTTIwIDIwTDgwIDgwSDIwVjIwWiIgZmlsbD0id2hpdGUiLz4KPGRlZnM+CjxsaW5lYXJHcmFkaWVudCBpZD0icGFpbnQwX2xpbmVhciIgeDE9IjIwIiB5MT0iMjAiIHgyPSI4MCIgeTI9IjgwIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CjxzdG9wIHN0b3AtY29sb3I9IiM2QjQ2QjQiLz4KPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjOEM1Q0Y2Ii8+CjwvbGluZWFyR3JhZGllbnQ+CjwvZGVmcz4KPC9zdmc+Cg==',
    downloadUrls: {
      website: 'https://slope.finance',
      ios: 'https://apps.apple.com/app/slope-wallet/id1574624530',
      android: 'https://play.google.com/store/apps/details?id=com.wd.wallet',
    },
    mobileDeepLink: (uri) => `slope://wc?uri=${encodeURIComponent(uri)}`,
    capabilities: {
      supportsVersionedTransactions: true,
      supportsSignAndSendTransaction: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
    },
    isMobile: true,
  },

  'trust': {
    name: 'Trust Wallet',
    shortName: 'Trust',
    identifier: 'com.trustwallet.app',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiByeD0iMTUiIGZpbGw9InVybCgjcGFpbnQwX2xpbmVhcikiLz4KPHBhdGggZD0iTTUwIDIwQzM1IDIwIDIwIDM1IDIwIDUwQzIwIDY1IDM1IDgwIDUwIDgwQzY1IDgwIDgwIDY1IDgwIDUwQzgwIDM1IDY1IDIwIDUwIDIwWiIgZmlsbD0id2hpdGUiLz4KPGRlZnM+CjxsaW5lYXJHcmFkaWVudCBpZD0icGFpbnQwX2xpbmVhciIgeDE9IjUwIiB5MT0iMjAiIHgyPSI1MCIgeTI9IjgwIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CjxzdG9wIHN0b3AtY29sb3I9IiMzMzc1QkIiLz4KPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjNDA5NkY5Ii8+CjwvbGluZWFyR3JhZGllbnQ+CjwvZGVmcz4KPC9zdmc+Cg==',
    downloadUrls: {
      website: 'https://trustwallet.com',
      chrome: 'https://chrome.google.com/webstore/detail/trust-wallet/egjidjbpglichdcondbcbdnbeeppgdph',
      ios: 'https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409',
      android: 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp',
    },
    mobileDeepLink: (uri) => `trust://wc?uri=${encodeURIComponent(uri)}`,
    capabilities: {
      supportsVersionedTransactions: true,
      supportsSignAndSendTransaction: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
    },
    isPopular: true,
  },

  'brave': {
    name: 'Brave Wallet',
    shortName: 'Brave',
    identifier: 'com.brave.wallet',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiByeD0iMTUiIGZpbGw9IiNGRjU1MDAiLz4KPHBhdGggZD0iTTUwIDIwTDcwIDQwSDMwTDUwIDIwWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTMwIDQwSDcwTDYwIDYwSDQwTDMwIDQwWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cg==',
    downloadUrls: {
      website: 'https://brave.com/wallet/',
      desktop: 'https://brave.com/download/',
    },
    capabilities: {
      supportsVersionedTransactions: true,
      supportsSignAndSendTransaction: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
    },
  },
}

// Helper functions to filter and organize wallets
export function getPopularWallets(): SolanaWalletConfig[] {
  return Object.values(solanaWallets).filter(wallet => wallet.isPopular)
}

export function getMobileWallets(): SolanaWalletConfig[] {
  return Object.values(solanaWallets).filter(wallet => wallet.isMobile)
}

export function getWalletByIdentifier(identifier: string): SolanaWalletConfig | undefined {
  return Object.values(solanaWallets).find(wallet => 
    wallet.identifier === identifier || 
    wallet.name.toLowerCase() === identifier.toLowerCase()
  )
}

// Get all wallets sorted by popularity
export function getAllWallets(): SolanaWalletConfig[] {
  return Object.values(solanaWallets).sort((a, b) => {
    if (a.isPopular && !b.isPopular) return -1
    if (!a.isPopular && b.isPopular) return 1
    return a.name.localeCompare(b.name)
  })
}
