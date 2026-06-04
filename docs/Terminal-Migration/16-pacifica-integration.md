# Pacifica Exchange Integration (REST + Signing)

Part of the Trading Terminal Migration set — see [README](./README.md).

This is the core exchange-integration doc for the terminal. Pacifica is a Solana-based perp DEX. Every authenticated action (orders, cancels, leverage, withdraw) is authorized with an **Ed25519 signature** over a deterministically-serialized JSON payload — there is no API-key/secret HMAC scheme for the user. Deposits are done **on-chain** (USDC SPL transfer to the Pacifica program), not via REST.

The integration exists in **two parallel forms**:

| Layer | File | Signer | Used by |
|---|---|---|---|
| **Client-side** | `apps/web/src/lib/pacifica/api-client.ts` + `apps/web/src/lib/pacifica/signing.ts` | Browser Solana wallet (`@solana/wallet-adapter-react`, `wallet.signMessage`) | Terminal UI when the user signs each action from their own wallet |
| **Server-side** | `apps/web/src/lib/server/pacifica.ts` + `apps/web/src/lib/server/pacifica-signing.ts` | `tweetnacl` Ed25519 keypair derived from a stored base58 private key | Next.js API routes / the universal adapter (`pacifica-adapter.ts`) |
| **Deposit (on-chain)** | `apps/web/src/lib/pacifica/deposit-instruction.ts` | Wallet signs a Solana transaction | `apps/web/src/components/deposit/DepositModal.tsx`, `useDeposit` hook |

> Official docs (always re-check field names/message formats here): **https://docs.pacifica.fi** · MCP server: `https://docs.pacifica.fi/~gitbook/mcp` (configured in `.mcp.json` as the `Pacifica` server). Python SDK that the signing + deposit logic was ported from: `https://github.com/pacifica-fi/python-sdk`.

---

## 1. Base URLs & env vars

| Constant | Value | Where |
|---|---|---|
| Client REST base | `process.env.NEXT_PUBLIC_PACIFICA_API_URL \|\| 'https://api.pacifica.fi'` | `api-client.ts` line 8 |
| Server REST base | `process.env.PACIFICA_API_URL \|\| 'https://api.pacifica.fi'` | `pacifica.ts` line 16 |
| Builder code | `process.env.PACIFICA_BUILDER_CODE \|\| 'TradeClub'` | `pacifica.ts` line 17, `pacifica-adapter.ts` line 44 |
| API key (optional) | `process.env.PACIFICA_API_KEY` → sent as header `PF-API-KEY` | `pacifica.ts` lines 18, 26-28 |

Env vars to set in the new repo:

```
NEXT_PUBLIC_PACIFICA_API_URL=https://api.pacifica.fi
PACIFICA_API_URL=https://api.pacifica.fi
PACIFICA_BUILDER_CODE=TradeClub          # builder/affiliate code attached to orders
PACIFICA_API_KEY=                        # optional; only set if Pacifica issues one
```

> WARNING: `PACIFICA_BUILDER_CODE='TradeClub'` and the builder-code approve/revoke flow are **app-specific monetization**, not strictly part of the terminal. The migrator can drop `builder_code`/`approveBuilderCode`/`revokeBuilderCode` entirely; orders work without it. If kept, change the default to the new project's own builder code.

---

## 2. REST endpoints used (complete list)

All paths are relative to the base URL. `POST` bodies are JSON. Pacifica wraps responses as `{ success, data, error, code }`.

### Public market data (no auth)

| Method | Endpoint | Function (client / server) | Notes |
|---|---|---|---|
| GET | `/api/v1/info` | `getMarkets()` | Market list: symbol, tick_size, lot_size, max_leverage, min/max order size, funding |
| GET | `/api/v1/info/prices` (server) / `/api/v1/markets/prices` (client) | `getPrices()` | Two different paths exist in the two clients. Server uses `/api/v1/info/prices`, client `api-client.ts` uses `/api/v1/markets/prices`. |
| GET | `/api/v1/book?symbol=...&agg_level=N` | `getOrderbook(symbol, aggLevel=1)` (server only) | `{ s, l:[[bids],[asks]], t }` where each level is `{p,a,n}` |
| GET | `/api/v1/kline?symbol=...&interval=...&start_time=...&end_time=...` | `getKlines()` (server) | Last-traded-price candles |
| GET | `/api/v1/mark_price_kline?symbol=...&interval=...&start_time=...` | `getMarkPriceKlines()` (server) | Continuous mark-price candles (preferred by adapter) |
| GET | `/api/v1/trades?symbol=...` | `getRecentTrades()` (server) | Recent public trades |

### Account data (account address in query string, no signature)

| Method | Endpoint | Function |
|---|---|---|
| GET | `/api/v1/account?account=...` | `getAccountInfo` / `getAccount` |
| GET | `/api/v1/account/settings?account=...` | `getAccountSettings` |
| GET | `/api/v1/positions?account=...` | `getPositions` |
| GET | `/api/v1/orders?account=...[&symbol=...]` | `getOpenOrders` |
| GET | `/api/v1/trades/history?account=...[&symbol&start_time&end_time&limit&cursor]` | `getTradeHistory` |
| GET | `/api/v1/orders/history?account=...[...same filters...]` | `getOrderHistory` (client only) |
| GET | `/api/v1/account/builder_codes/approvals?account=...` | `getBuilderCodeApprovals` (server) |

### Trading / mutations (require signature)

| Method | Endpoint | Operation `type` | Function |
|---|---|---|---|
| POST | `/api/v1/orders/create_market` | `create_market_order` | `createMarketOrder` |
| POST | `/api/v1/orders/create` | `create_order` | `createLimitOrder` |
| POST | `/api/v1/orders/edit` | `edit_order` | `editOrder` (client only) |
| POST | `/api/v1/orders/cancel` | `cancel_order` | `cancelOrder` |
| POST | `/api/v1/orders/cancel_all` | `cancel_all_orders` | `cancelAllOrders` |
| POST | `/api/v1/orders/stop/create` | `create_stop_order` | `createStopOrder` |
| POST | `/api/v1/account/update_leverage` (client) / `/api/v1/account/leverage` (server) | `update_leverage` | `setLeverage` / `updateLeverage` (path differs) |
| POST | `/api/v1/positions/tpsl` | `set_position_tpsl` | `setPositionTpSl` (client only) |
| POST | `/api/v1/account/builder_codes/approve` | `approve_builder_code` | `approveBuilderCode` |
| POST | `/api/v1/account/withdraw` | `withdraw` | `withdraw` |

> The signed-operation `type` string is **separate from the URL path** and must match Pacifica's expected value exactly (e.g. the cancel endpoint is `/orders/cancel` but the signed `type` is `cancel_order`). Get these wrong and signatures verify against the wrong canonical message and return `400`.

---

## 3. The signing pattern (THE critical part)

Pacifica signs a **canonical JSON message** with these rules:

1. Build a wrapper object:
   ```jsonc
   {
     "timestamp": <ms epoch>,        // Date.now()
     "expiry_window": <ms>,          // client uses 5000; server default 30000 (5000 for builder-code)
     "type": "<operation_type>",     // e.g. "create_order"
     "data": { ...operation_data }   // the operation-specific fields
   }
   ```
2. **Recursively sort all object keys alphabetically** (arrays keep order; nested objects sorted too).
3. **`JSON.stringify` with no spaces** (compact). This is the canonical message string.
4. Encode to UTF-8 bytes, sign with **Ed25519**, encode the 64-byte signature as **base58**.
5. The signed `data` fields are then **spread flat into the final REST body**, alongside `account`, `signature`, `timestamp`, `expiry_window`.

Crucial gotchas reproduced from the code comments:

- **`account` is NOT part of the signed `data`.** It is only added to the outer request body. The signed message contains only `timestamp`, `expiry_window`, `type`, `data`.
- The signed `data` must contain exactly the fields sent (same names, same types). E.g. `leverage` is signed as an **integer**, not a string (client `signing.ts` does `parseInt(...)`; server `pacifica-signing.ts` takes `number`).
- For TP/SL removal, `null` is signed explicitly (means "remove"); `undefined` means "omit".

### 3a. Client-side signer — verbatim core (`apps/web/src/lib/pacifica/signing.ts`)

```ts
function sortKeysRecursive(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysRecursive);
  return Object.keys(obj)
    .sort()
    .reduce((sorted: any, key: string) => {
      sorted[key] = sortKeysRecursive(obj[key]);
      return sorted;
    }, {});
}

async function signPacificaOperation(
  wallet: WalletContextState,
  operationType: string,
  data: Record<string, any>
): Promise<SignedOperation> {
  if (!wallet.connected || !wallet.publicKey || !wallet.signMessage) {
    throw new Error('Wallet not connected');
  }

  const timestamp = Date.now();
  const expiryWindow = 5000; // 5 seconds

  const operationData = {
    timestamp,
    expiry_window: expiryWindow,
    type: operationType,
    data: data,
  };

  const sortedData = sortKeysRecursive(operationData);
  const message = JSON.stringify(sortedData);          // compact, sorted

  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = await wallet.signMessage(messageBytes);  // Solana wallet ed25519
  const signature = bs58.encode(signatureBytes);                  // base58

  return { signature, timestamp };
}
```

The client signer returns only `{ signature, timestamp }`. The **API client** (`api-client.ts`) is then called with that signature/timestamp and rebuilds the final request body, e.g. for a limit order:

```ts
// caller in the terminal:
const { signature, timestamp } = await createSignedLimitOrder(wallet, params);
await createLimitOrder(account, params, signature, timestamp);

// inside createLimitOrder():
body: JSON.stringify({ account, ...params, signature, timestamp, expiry_window: 5000 })
```

> Because the client signer and the client API call **independently reconstruct** the `data`/body, the two field sets must stay identical or the signature won't verify. Note: `signing.ts` comments explicitly say `post_only` is NOT a valid Pacifica limit-order field even though `api-client.ts createLimitOrder` types it — only `tif` is signed/sent in the signed path.

Dependencies (client): `@solana/wallet-adapter-react` (type `WalletContextState`), `bs58`.

### 3b. Server-side signer — verbatim core (`apps/web/src/lib/server/pacifica-signing.ts`)

```ts
import * as nacl from 'tweetnacl';
import { base58 } from '@scure/base';

export function keypairFromPrivateKey(privateKeyBase58: string): nacl.SignKeyPair {
  const privateKeyBytes = base58.decode(privateKeyBase58);
  return nacl.sign.keyPair.fromSecretKey(privateKeyBytes);
}
export function getPublicAddress(keypair: nacl.SignKeyPair): string {
  return base58.encode(keypair.publicKey);
}

export function signRequest(
  keypair: nacl.SignKeyPair,
  operationType: string,
  data: Record<string, unknown>,
  expiryWindow = 30000
): Record<string, unknown> {
  const timestamp = Date.now();

  const signatureHeader = { timestamp, expiry_window: expiryWindow, type: operationType };
  const dataToSign = { ...signatureHeader, data };

  const sortedMessage = sortJsonKeys(dataToSign);           // recursive alpha sort
  const compactJson = JSON.stringify(sortedMessage);        // compact
  const messageBytes = new TextEncoder().encode(compactJson);
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey); // ed25519
  const signatureBase58 = base58.encode(signatureBytes);

  return {
    account: getPublicAddress(keypair),
    agent_wallet: null,
    signature: signatureBase58,
    timestamp,
    expiry_window: expiryWindow,
    ...data, // flat spread of the ORIGINAL data (not the wrapper)
  };
}
```

Key server-side differences vs client:
- Default `expiry_window` is **30000** (vs client's hard-coded `5000`); builder-code approval overrides to `5000`.
- The returned object includes **`agent_wallet: null`** — the client path does not. (Pacifica supports an agent-wallet delegation model; this app passes `null`.)
- `signRequest` returns the **full ready-to-POST body**, so `pacifica.ts` just calls `request('POST', endpoint, signedPayload)`.

Dependencies (server): `tweetnacl`, `@scure/base` (`base58`).

### 3c. Operation `data` shapes (signed fields)

Reproduced from both signers. Fields are the signed `data` (account excluded).

| Operation `type` | Signed `data` fields |
|---|---|
| `create_market_order` | `symbol, amount, side('bid'\|'ask'), slippage_percent, reduce_only`, opt: `client_order_id`, `builder_code`, `take_profit:{stop_price}`, `stop_loss:{stop_price}` |
| `create_order` (limit) | `symbol, price, amount, side, tif('GTC'\|'IOC'\|'ALO'\|'TOB'), reduce_only`, opt: `client_order_id`, `builder_code`, `take_profit`, `stop_loss` |
| `edit_order` | `symbol, price, amount`, one of: `order_id` / `client_order_id` |
| `cancel_order` | `symbol`, one of: `order_id` / `client_order_id` |
| `cancel_stop_order` | `order_id, symbol` (client only) |
| `cancel_all_orders` | `all_symbols, exclude_reduce_only`, opt: `symbol` |
| `create_stop_order` | `symbol, side, reduce_only, stop_order:{ stop_price, amount, opt limit_price, opt client_order_id }` |
| `update_leverage` | `symbol, leverage` (**integer**) |
| `update_margin_mode` | `symbol, is_isolated(bool)` (client only) |
| `set_position_tpsl` | `symbol, side`, opt `size` (partial), `take_profit`/`stop_loss` as `{stop_price, opt limit_price}` or `null` to remove (client only) |
| `approve_builder_code` | `builder_code, max_fee_rate` |
| `revoke_builder_code` | `builder_code` (client only) |
| `withdraw` | `amount` |

`side` is always `'bid'` (=BUY/long) or `'ask'` (=SELL/short). Normalized to Pacifica side mapping lives in `pacifica-adapter.ts` (`BUY -> bid`, `SELL -> ask`).

---

## 4. Response envelope & error handling

Pacifica returns:

```ts
interface PacificaResponse<T> { success: boolean; data: T; error: string | null; code: number | null; }
```

- **Client (`api-client.ts`)**: returns `response.json()` as-is (`{success,data,error}`); on `!response.ok` throws `new Error(error.error || 'HTTP <status>')`.
- **Server (`pacifica.ts`)**: unwraps to `data.data`; on HTTP 429 throws `RateLimitError`, on `!ok || !success` throws `ApiError(message, status)`, on network failure throws `ApiError('Pacifica API unavailable', 503)`. `RateLimitError`/`ApiError` come from `apps/web/src/lib/server/errors.ts` (migrator must port or replace these).
- **Withdraw** is special: success is signaled at the **top level** (`data.success`), not inside `data` — see `pacifica.ts withdraw()`.

Auth header (server only): `PF-API-KEY: <PACIFICA_API_KEY>` plus `Content-Type`/`Accept: application/json`.

---

## 5. Response types (copy-paste from `pacifica.ts`)

These are the verbatim Pacifica field names you'll deserialize. Reproduced exactly:

```ts
interface MarketInfo {
  symbol: string; tick_size: string; min_tick: string; max_tick: string;
  lot_size: string; max_leverage: number; isolated_only: boolean;
  min_order_size: string; max_order_size: string;
  funding_rate: string; next_funding_rate: string; created_at: number;
}
interface MarketPrice {
  symbol: string; funding: string; mark: string; mid: string; next_funding: string;
  open_interest: string; oracle: string; timestamp: number;
  volume_24h: string; yesterday_price: string;
}
interface OrderbookResponse { s: string; l: Array<Array<{ p: string; a: string; n: number }>>; t: number; }
interface Candle { t:number; T:number; s:string; i:string; o:string; c:string; h:string; l:string; v:string; n:number; }
interface AccountInfo {
  balance:string; fee_level:number; maker_fee:string; taker_fee:string;
  account_equity:string; available_to_spend:string; available_to_withdraw:string;
  pending_balance:string; total_margin_used:string; cross_mmr:string;
  positions_count:number; orders_count:number; stop_orders_count:number;
  updated_at:number; use_ltp_for_stop_orders:boolean;
}
interface Position {
  symbol:string; side:string; amount:string; entry_price:string; margin:string;
  funding:string; leverage:string; liq_price:string; isolated:boolean;
  created_at:number; updated_at:number;
}
interface OpenOrder {
  order_id:number; client_order_id:string|null; symbol:string; side:string; price:string;
  initial_amount:string; filled_amount:string; cancelled_amount:string;
  stop_price:string|null; order_type:string; stop_parent_order_id:number|null;
  reduce_only:boolean; created_at:number; updated_at:number;
}
```

Order-type strings Pacifica returns (`order_type`): `market`, `limit`, `stop_loss_market`, `stop_loss_limit`, `take_profit_market`, `take_profit_limit`. Trade-history `side` values: `open_long`, `open_short`, `close_long`, `close_short`.

---

## 6. Deposit (on-chain, no REST) — `apps/web/src/lib/pacifica/deposit-instruction.ts`

Deposits move USDC from the user's Associated Token Account into the Pacifica vault via an Anchor `deposit(amount: u64)` instruction on Solana **mainnet-beta**. Pacifica detects the on-chain transfer and credits the account; **there is no REST deposit endpoint.**

Fixed mainnet accounts (verbatim):

```ts
export const PACIFICA_PROGRAM_ID    = new PublicKey('PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH');
export const PACIFICA_CENTRAL_STATE = new PublicKey('9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY');
export const PACIFICA_VAULT         = new PublicKey('72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa');
export const USDC_MINT              = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const USDC_DECIMALS = 6;
export const MIN_DEPOSIT_USDC = 10;

// Anchor discriminator = sha256("global:deposit")[:8], precomputed:
const DEPOSIT_DISCRIMINATOR = Buffer.from([0xf2,0x23,0xc6,0x89,0x52,0xe1,0xf2,0xb6]);
```

Instruction builder (verbatim):

```ts
export function buildDepositInstruction(depositor: PublicKey, uiAmount: number): TransactionInstruction {
  const depositorUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, depositor, false);
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('__event_authority')], PACIFICA_PROGRAM_ID
  );

  return new TransactionInstruction({
    programId: PACIFICA_PROGRAM_ID,
    keys: [
      { pubkey: depositor,                   isSigner: true,  isWritable: true  },
      { pubkey: depositorUsdcAta,            isSigner: false, isWritable: true  },
      { pubkey: PACIFICA_CENTRAL_STATE,      isSigner: false, isWritable: true  },
      { pubkey: PACIFICA_VAULT,              isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,            isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: USDC_MINT,                   isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,     isSigner: false, isWritable: false },
      { pubkey: eventAuthority,              isSigner: false, isWritable: false },
      { pubkey: PACIFICA_PROGRAM_ID,         isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DEPOSIT_DISCRIMINATOR, encodeDepositArgs(uiAmount)]),
  });
}
```

`encodeDepositArgs(uiAmount)` converts UI USDC to 6-decimal lamports as a little-endian `u64`:
```ts
const lamports = BigInt(Math.round(uiAmount * 10 ** USDC_DECIMALS));
const buf = Buffer.alloc(8); buf.writeBigUInt64LE(lamports, 0); return buf;
```

Caller responsibilities (the function only builds the instruction):
1. The depositor's USDC ATA must already exist (true for any wallet holding USDC).
2. Wrap in a `Transaction`, set blockhash/fee payer, have the wallet sign+send.
3. Enforce `MIN_DEPOSIT_USDC` (10) in the UI. Withdrawals are REST (`/api/v1/account/withdraw`, signed `withdraw`), not on-chain.

UI integration lives in `apps/web/src/components/deposit/DepositModal.tsx` + `apps/web/src/hooks/useDeposit.ts` (+ `useUsdcBalance.ts`) — out of scope here but the migrator should port them together with this file. Dependencies: `@solana/web3.js`, `@solana/spl-token`.

---

## 7. Universal adapter wrapper — `pacifica-adapter.ts`

`PacificaAdapter implements ExchangeAdapter` (interface in `apps/web/src/lib/server/exchanges/adapter.ts`). It normalizes Pacifica to exchange-agnostic types and is what the order-router/API routes actually call. Key behaviors:

- **Symbol mapping**: `BTC` to `BTC-USD` (`normalizeSymbol`/`denormalizeSymbol`).
- **Side mapping**: `bid` to `BUY/LONG`, `ask` to `SELL/SHORT`.
- **TIF mapping**: `POST_ONLY -> ALO`, `FOK -> IOC` (Pacifica has no FOK).
- **Auth**: `extractKeypair(auth)` requires `auth.credentials.type === 'pacifica'` then `keypairFromPrivateKey(privateKey)` (base58 Ed25519). See `AuthContext`/`ExchangeCredentials` in `adapter.ts`.
- Klines prefer `getMarkPriceKlines`, fall back to `getKlines`.
- `getAccount` recomputes `unrealizedPnl` by summing `pos.unrealized_pnl` across positions (note: the `Position` REST type above does **not** include `unrealized_pnl`, so this often sums to `'0'` — see Gaps).

The adapter is **exchange-agnostic by design** and contains **no fight/duel logic** — good for migration. The builder-code constructor default `'TradeClub'` is the only app-specific bleed.

---

## 8. Migration quick-start

1. Port `signing.ts` (client) **or** `pacifica-signing.ts` (server) depending on whether the new terminal signs in-browser or server-side. The canonical-message rules (sort keys recursively -> compact JSON -> ed25519 -> base58, account excluded) are the load-bearing contract.
2. Port `api-client.ts` (client) and/or `pacifica.ts` (server) for the REST calls. Reconcile the path discrepancies noted in section 2 (prices, leverage) against live docs at https://docs.pacifica.fi.
3. Port `deposit-instruction.ts` verbatim + the deposit UI components.
4. Replace `RateLimitError`/`ApiError` imports from `server/errors.ts`.
5. Decide whether to keep builder-code logic; if not, strip `builder_code`/`approve`/`revoke`.
