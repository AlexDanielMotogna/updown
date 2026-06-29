/**
 * Symbol normalization. The adapter's public surface uses normalized
 * "<BASE>-USD" symbols (e.g. "BTC-USD"); HyperLiquid's API uses the bare coin
 * name (e.g. "BTC", or "xyz:XYZ100" for HIP-3 dexs). Keep all HL-specific
 * symbol handling here.
 */

const QUOTE = '-USD';

/** A spot coin/symbol is HL's pair name: "@<index>" (non-canonical) or "BASE/QUOTE"
 * (canonical). These are already the symbol — never suffix "-USD". */
function isSpotCoin(s: string): boolean {
  return s.startsWith('@') || s.includes('/');
}

/** "BTC" → "BTC-USD"; "xyz:XYZ100" → "xyz:XYZ100-USD"; spot coins pass through
 * ("@107" → "@107", "PURR/USDC" → "PURR/USDC"). */
export function toNormalizedSymbol(coin: string): string {
  return isSpotCoin(coin) ? coin : `${coin}${QUOTE}`;
}

/** "BTC-USD" → "BTC"; bare coins and spot coins ("@107", "PURR/USDC") pass through. */
export function toHlCoin(symbol: string): string {
  return symbol.endsWith(QUOTE) ? symbol.slice(0, -QUOTE.length) : symbol;
}
