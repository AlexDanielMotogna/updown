/**
 * Client-side realtime. Imports the SDK-free `exchange-hyperliquid/client` entry
 * so the browser bundle stays lean. One shared stream (one WebSocket) for the app.
 */
import { HyperliquidStream, MAINNET, TESTNET, type HlEndpoint } from 'exchange-hyperliquid/client';

function endpoint(): HlEndpoint {
  const url = process.env.NEXT_PUBLIC_HYPERLIQUID_API_URL;
  if (url) return { apiUrl: url.replace(/\/$/, '') };
  return process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET !== 'false' ? TESTNET : MAINNET;
}

let stream: HyperliquidStream | null = null;

export function getStream(): HyperliquidStream {
  if (!stream) {
    const ep = endpoint();
    console.log('[DBG stream] creating HyperliquidStream', ep);
    stream = new HyperliquidStream({ endpoint: ep });
  }
  return stream;
}
