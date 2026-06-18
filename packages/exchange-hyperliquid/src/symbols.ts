/**
 * Symbol normalization. The adapter's public surface uses normalized
 * "<BASE>-USD" symbols (e.g. "BTC-USD"); HyperLiquid's API uses the bare coin
 * name (e.g. "BTC", or "xyz:XYZ100" for HIP-3 dexs). Keep all HL-specific
 * symbol handling here.
 */

const QUOTE = '-USD';

/** "BTC" → "BTC-USD"; "xyz:XYZ100" → "xyz:XYZ100-USD". */
export function toNormalizedSymbol(coin: string): string {
  return `${coin}${QUOTE}`;
}

/** "BTC-USD" → "BTC"; passes through a bare coin unchanged. */
export function toHlCoin(symbol: string): string {
  return symbol.endsWith(QUOTE) ? symbol.slice(0, -QUOTE.length) : symbol;
}
