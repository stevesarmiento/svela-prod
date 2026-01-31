// Logo override system for tokens with custom/curated logos
// xStock logos are stored in /public/logos/xstocks/{symbol}.png

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

/**
 * Get the logo URL for a token, using local override if available
 * @param symbol - Token symbol (e.g., "AAPLx")
 * @param fallbackLogoURI - Fallback logo URI from API
 * @returns Logo URL to use
 */
export function getTokenLogoURL(symbol: string | undefined, fallbackLogoURI: string | undefined): string | undefined {
    if (!symbol) return fallbackLogoURI;

    // Normalize symbol (handle case variations)
    const normalizedSymbol = symbol.trim();

    // Check for direct match
    if (XSTOCK_LOGOS.has(normalizedSymbol)) {
        return `/logos/xstocks/${normalizedSymbol}.png`;
    }

    // Check for mapped symbol
    const mappedFilename = SYMBOL_TO_FILENAME[normalizedSymbol];
    if (mappedFilename && XSTOCK_LOGOS.has(mappedFilename)) {
        return `/logos/xstocks/${mappedFilename}.png`;
    }

    // Check case-insensitive match
    for (const logo of XSTOCK_LOGOS) {
        if (logo.toLowerCase() === normalizedSymbol.toLowerCase()) {
            return `/logos/xstocks/${logo}.png`;
        }
    }

    // Return fallback
    return fallbackLogoURI;
}

/**
 * Check if a token has a local logo override
 */
export function hasLocalLogo(symbol: string | undefined): boolean {
    if (!symbol) return false;
    const normalized = symbol.trim();
    return (
        XSTOCK_LOGOS.has(normalized) ||
        Object.keys(SYMBOL_TO_FILENAME).includes(normalized) ||
        Array.from(XSTOCK_LOGOS).some(logo => logo.toLowerCase() === normalized.toLowerCase())
    );
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
