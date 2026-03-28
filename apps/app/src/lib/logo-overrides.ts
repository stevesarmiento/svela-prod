// Logo override system for tokens with custom/curated logos
// Static logo assets live in `apps/app/public/logos/...` and are served at `/logos/...`.

const LOGOS_ROUTE_BASE = "/logos" as const;
const XSTOCKS_ROUTE_BASE = `${LOGOS_ROUTE_BASE}/xstocks` as const;
const POPULAR_ROUTE_BASE = `${LOGOS_ROUTE_BASE}/popular` as const;
const XSTOCK_LOGO_EXTENSION = "png" as const;
const POPULAR_LOGO_EXTENSION = "svg" as const;

function getXstockLogoFilename(symbol: string): string | null {
    const trimmed = symbol.trim();
    if (!trimmed) return null;

    // Some tickers contain punctuation that can't be used in filenames (e.g. BRK.B → BRK_B).
    const normalizedForFilename = trimmed.replace(/[.\-]/g, "_");

    const candidates = trimmed === normalizedForFilename ? [trimmed] : [trimmed, normalizedForFilename];

    for (const candidate of candidates) {
        if (XSTOCK_LOGOS.has(candidate)) return candidate;

        const mappedFilename = SYMBOL_TO_FILENAME[candidate];
        if (mappedFilename && XSTOCK_LOGOS.has(mappedFilename)) return mappedFilename;

        // Case-insensitive match (but preserve the real filename casing from the set).
        for (const logo of XSTOCK_LOGOS) {
            if (logo.toLowerCase() === candidate.toLowerCase()) return logo;
        }
    }

    return null;
}

function normalizeSymbol(symbol: string): string {
    return symbol.trim().toLowerCase();
}

function getPopularLogoFilename(symbol: string): string | null {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return null;
    return POPULAR_SYMBOL_TO_FILENAME[normalized] ?? null;
}

// Set of available xStock logo symbols (filename without extension)
const XSTOCK_LOGOS = new Set([
    'AAPLx',
    'ABBVx',
    'ABTx',
    'ACNx',
    'ADBEx',
    'AMBRx',
    'AMDx',
    'AMZNx',
    'APPx',
    'ASMLx',
    'ASTSx',
    'AVGOx',
    'AXPx',
    'AZNx',
    'BACx',
    'BKNGx',
    'BLKx',
    'BLSHx',
    'BMNRx',
    'BRK_Bx',
    'BTBTx',
    'CLSKx',
    'CMCSAx',
    'COINx',
    'CORZx',
    'COSTx',
    'CRCLx',
    'CRMx',
    'CRWDx',
    'CSCOx',
    'CVXx',
    'DFDVx',
    'DHRx',
    'DUOLx',
    'EBAYx',
    'EXPEx',
    'FIGx',
    'FUFUx',
    'GLDx',
    'GLXYx',
    'GMEx',
    'GOOGLx',
    'GSx',
    'HDx',
    'HONx',
    'HOODx',
    'HSDTx',
    'HUTx',
    'IBMx',
    'IJRx',
    'INTCx',
    'IWMx',
    'JNJx',
    'JPMx',
    'KOx',
    'LINx',
    'LLYx',
    'LULUx',
    'MARAx',
    'MAx',
    'MCDx',
    'MDTx',
    'METAx',
    'MNSTx',
    'MRKx',
    'MRVLx',
    'MSFTx',
    'MSTRx',
    'MUx',
    'NFLXx',
    'NVDAx',
    'NVOx',
    'OKLOx',
    'OPENx',
    'ORCLx',
    'PANWx',
    'PEPx',
    'PFEx',
    'PGx',
    'PLTRx',
    'PLx',
    'PMx',
    'PYPLx',
    'QQQx',
    'RBLXx',
    'RIOTx',
    'RKLBx',
    'SBETx',
    'SCHFx',
    'SPCEx',
    'SPYx',
    'STRCx',
    'SUIGx',
    'TBLLx',
    'TEMx',
    'TGTx',
    'TMOx',
    'TMUSx',
    'TONXx',
    'TQQQx',
    'TRONx',
    'TSLAx',
    'TSMx',
    'Tx',
    'UBERx',
    'UNHx',
    'VSTx',
    'VTIx',
    'VTx',
    'Vx',
    'WBDx',
    'WENx',
    'WMTx',
    'WULFx',
    'XOMx',
]);

// Alternative symbol mappings for symbols that might differ from filenames
const SYMBOL_TO_FILENAME: Record<string, string> = {
    // Map any different API symbols to their filename
    IEMGx: 'IJRx', // Core MSCI EM might have different symbol
    SPGIx: 'SPYx', // S&P Global might map differently
    STRKx: 'STRCx', // Strategy PP Fixed
};

// Popular coin logo overrides (served from `/public/logos/popular`).
const POPULAR_SYMBOL_TO_FILENAME: Record<string, string> = {
    btc: "bitcoin",
    bitcoin: "bitcoin",
    eth: "ethereum",
    ethereum: "ethereum",
    sol: "solana",
    solana: "solana",
    ada: "cardano",
    cardano: "cardano",
    trx: "tron",
    tron: "tron",
    bnb: "bnb",
    usdt: "tether",
    tether: "tether",
    apt: "aptos",
    aptos: "aptos",
    hype: "hyperliquid",
    hyperliquid: "hyperliquid",
    mon: "monad",
    monad: "monad",
    okxbtc: "okxbtc",
};

/**
 * Get the logo URL for a token, using local override if available
 * @param symbol - Token symbol (e.g., "AAPLx")
 * @param fallbackLogoURI - Fallback logo URI from API
 * @returns Logo URL to use
 */
export function getTokenLogoURL(symbol: string | undefined, fallbackLogoURI: string | undefined): string | undefined {
    if (!symbol) return fallbackLogoURI;

    const filename = getXstockLogoFilename(symbol);
    if (filename) return `${XSTOCKS_ROUTE_BASE}/${filename}.${XSTOCK_LOGO_EXTENSION}`;

    const popularFilename = getPopularLogoFilename(symbol);
    if (popularFilename) return `${POPULAR_ROUTE_BASE}/${popularFilename}.${POPULAR_LOGO_EXTENSION}`;

    // Return fallback
    return fallbackLogoURI;
}

/**
 * Check if a token has a local logo override
 */
export function hasLocalLogo(symbol: string | undefined): boolean {
    if (!symbol) return false;
    return getXstockLogoFilename(symbol) !== null || getPopularLogoFilename(symbol) !== null;
}

/**
 * Clean token name by removing common suffixes/prefixes.
 *
 * - xStocks: "Nasdaq xStock" → "Nasdaq"
 * - LSTs: "Jupiter Staked SOL" → "Jupiter", "Marinade staked SOL (mSOL)" → "Marinade"
 * - Wrapped tokens: "Wrapped Ether" → "Ether", "Coinbase Wrapped BTC" → "BTC"
 * - Bridge markers: "(Wormhole)", "(Bridged)", etc.
 */
export function cleanTokenName(name: string | undefined): string {
    if (!name) return 'Unknown';
    return (
        name
            // xStocks
            .replace(/\s*xStock\s*$/i, '')
            // Bridge/origin markers in parens
            .replace(/\s*\(\s*(wormhole|bridged|wrapped|omnibridge|coinbase|ondo\s+tokenized)\s*\)\s*/gi, ' ')
            // Remove (mSOL) and similar LST markers
            .replace(/\s*\(\s*mSOL\s*\)\s*/gi, ' ')
            // Wrapped variants
            .replace(/^\s*coinbase\s+wrapped\s+/i, '')
            .replace(/^\s*wrapped\s+/i, '')
            .replace(/\s+wrapped\s+/gi, ' ')
            .replace(/\s+wrapped\s*$/i, '')
            // LST suffixes
            .replace(/\s+staked\s+sol(?=\s*(\(|$))/i, '')
            // Normalize whitespace
            .replace(/\s{2,}/g, ' ')
            .trim() || 'Unknown'
    );
}
