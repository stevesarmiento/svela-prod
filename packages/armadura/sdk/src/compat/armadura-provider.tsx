'use client'

/**
 * Compatibility wrapper for @armadura/connector
 * 
 * This provides backward compatibility for existing users of @armadura/connector
 * while allowing the SDK to work with any connector implementation.
 */

import React from 'react'
import { ArmaProvider, type ArmaProviderProps } from '../core/arma-provider'

// Dynamic import type for @armadura/connector to avoid hard dependency
type UseConnectorClient = () => any

/**
 * ArmaProvider configured specifically for @armadura/connector
 * 
 * @deprecated Use the generic ArmaProvider with your connector hook instead
 * 
 * Example migration:
 * ```tsx
 * // Old (deprecated):
 * import { ArmaturaProvider } from '@armadura/sdk/compat'
 * 
 * // New (recommended):
 * import { ArmaProvider } from '@armadura/sdk'
 * import { useConnectorClient } from '@armadura/connector'
 * 
 * <ArmaProvider useConnector={useConnectorClient} config={config}>
 *   {children}
 * </ArmaProvider>
 * ```
 */
export function ArmaturaProvider({ 
  useConnector, 
  ...props 
}: Omit<ArmaProviderProps, 'useConnector'> & { useConnector?: UseConnectorClient }) {
  if (!useConnector) {
    throw new Error(
      'ArmaturaProvider requires useConnectorClient from @armadura/connector. ' +
      'Please install @armadura/connector and pass useConnectorClient to useConnector prop, ' +
      'or migrate to the generic ArmaProvider.'
    )
  }

  return <ArmaProvider useConnector={useConnector} {...props} />
}
