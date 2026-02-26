Get market info
This endpoint allows users to get exchange information, including market specifications for all available trading pairs.

Copy
GET /api/v1/info
Response
Status 200: Success

Copy
{
"success": true,
"data": [
{
"symbol": "ETH",
"tick_size": "0.1",
"min_tick": "0",
"max_tick": "1000000",
"lot_size": "0.0001",
"max_leverage": 50,
"isolated_only": false,
"min_order_size": "10",
"max_order_size": "5000000",
"funding_rate": "0.0000125",
"next_funding_rate": "0.0000125",
"created_at": 1748881333944
},
{
"symbol": "BTC",
"tick_size": "1",
"min_tick": "0",
"max_tick": "1000000",
"lot_size": "0.00001",
"max_leverage": 50,
"isolated_only": false,
"min_order_size": "10",
"max_order_size": "5000000",
"funding_rate": "0.0000125",
"next_funding_rate": "0.0000125",
"created_at": 1748881333944
},
....
],
"error": null,
"code": null
}
Field
Type
Description
"symbol"

string

Trading pair symbol

"tick_size"

decimal string

Tick size. All prices are denominated as a multiple of this.

"min_tick"

decimal string

Minimum tick. API submitted price cannot be below this value

"max_tick"

decimal string

Maximum tick. API submitted price cannot be above this value

"lot_size"

decimal string

Lot size. All order sizes (token denominated) are denominated as a multiple of this.

"max_leverage"

integer

Maximum leverage allowed on this symbol when opening positions

"isolated_only"

boolean

If the market is set to only allow isolated positions

"min_order_size"

decimal string

Minimum order size (denominated in USD)

"max_order_size"

decimal string

Maximum order size (denominated in USD)

"funding_rate"

decimal string

Funding rate paid in the past funding epoch (hour)

"next_funding_rate"

decimal string

Estimated funding rate to be paid in the next funding epoch (hour)

"created_at"

ISO 8601 string

Timestamp when the market was listed on Pacifica. Markets are returned oldest first.

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"/api/v1/info",
headers={"Accept": "_/_"},
)

data = response.json()

Get prices
This endpoint allows users to get price information for all symbols, including mark prices, funding rates, and market statistics.

Copy
GET /api/v1/info/prices
Response
Status 200: Success

Copy
{
"success": true,
"data": [
{
"funding": "0.00010529",
"mark": "1.084819",
"mid": "1.08615",
"next_funding": "0.00011096",
"open_interest": "3634796",
"oracle": "1.084524",
"symbol": "XPL",
"timestamp": 1759222967974,
"volume_24h": "20896698.0672",
"yesterday_price": "1.3412"
}
],
"error": null,
"code": null
}
Field
Type
Description
"funding"

decimal string

funding rate paid in the past funding epoch (hour)

"mark"

decimal string

Mark price, as defined above

"mid"

decimal string

Mid price, defined as the average of the best bid and best ask price

"next_funding"

decimal string

estimated funding rate to be paid in the next funding epoch (hour)

"open_interest"

decimal string

The current open interest on this symbol (in USD)

"oracle"

decimal string

Oracle price, as defined above

"symbol"

string

Trading pair symbol

"timestamp"

integer

Timestamp in Milliseconds

"volume_24h"

boolean

Volume (USD) of this market in the past 24 hours

"yesterday_price"

decimal string

Oracle price of this market 24 hours ago (USD)

Status 404: No prices data available

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"/api/v1/info/prices",
headers={"Accept": "_/_"},
)

data = response.json()

Get orderbook
This endpoint allows users to retrieve the current orderbook (bid/ask levels) for a specified trading symbol.

Copy
/api/v1/book
Query Parameters
Field
Type
Need
Description
Example
"symbol"

string

required

Trading pair symbol

BTC

"agg_level"

integer

no

Aggregation level for price grouping. Defaults to 1

1

Copy
api/v1/book?symbol=BTC
Response
Status 200: Successfully retrieved book data

Copy
{
"success": true,
"data": {
"s": "BTC",
"l": [
[
{
"p": "106504",
"a": "0.26203",
"n": 1
},
{
"p": "106498",
"a": "0.29281",
"n": 1
}
],
[
{
"p": "106559",
"a": "0.26802",
"n": 1
},
{
"p": "106564",
"a": "0.3002",
"n": 1
},
]
],
"t": 1751370536325
},
"error": null,
"code": null
}
Field
Type
Description
's'

string

Symbol

'l'

array

Two-dimensional array containing bids (index 0) and asks (index 1). Each index contains up to 10 levels.

't'

string

Response timestamp in milliseconds

'p'

decimal string

Price level

'a'

decimal string

Total amount at price level

'n'

integer

Number of orders at level

Status 400: Invalid request parameters

Status 401: Unauthorized access

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"api.pacifica.fi/api/v1/book?symbol=BTC",
headers={"Accept": "_/_"},
)

data = response.json()

Get account info
This endpoint allows users to get all high-level account info such as balance, fee level, equity, etc.

Copy
GET /api/v1/account
Query Parameters
Field
Type
Need
Description
Example
"account"

string

required

Account address

42trU9A5...

Copy
/api/v1/account?account=42trU9A5...
Response
Status 200: Successfully retrieved account information

Copy
{
"success": true,
"data": [{
"balance": "2000.000000",
"fee_level": 0,
"account_equity": "2150.250000",
"available_to_spend": "1800.750000",
"available_to_withdraw": "1500.850000",
"pending_balance": "0.000000",
"total_margin_used": "349.500000",
"cross_mmr": "420.690000",
"positions_count": 2,
"orders_count": 3,
"stop_orders_count": 1,
"updated_at": 1716200000000,
"use_ltp_for_stop_orders": false
}
],
"error": null,
"code": null
}
Field
Type
Description
'balance'

decimal string

Current account balance, defined as amount of USD in account before settlement

'fee_level'

integer

Current fee tier of account, determined by trading volume

'account_equity'

decimal string

Account balance + unrealized PnL

'available_to_spend'

decimal string

Amount of account equity that is available to used to margin for open positions and orders

'available_to_withdraw'

decimal string

Amount that is available to withdraw out from the exchange

'pending_balance'

decimal string

Amount of account balance in pending status (deposit request is successful, waiting on confirmation)

'total_margin_used'

decimal string

Amount of account equity currently being used to margin for open positions and orders

'cross_mmr'

decimal string

The maintenance margin required under the cross mode

'positions_count'

integer

Number of open positions (isolated and cross)

'orders_count'

integer

Number of open orders across all markets (excludes stop orders)

'stop_orders_count'

integer

Number of open stop orders across markets

'updated_at'

integer

Timestamp in milliseconds of last account info update

'use_ltp_for_stop_orders'

boolean

If the account uses last traded price to trigger stop orders

Status 400: Invalid request parameters

Status 401: Unauthorized access

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"/api/v1/account?account=42trU9A5...",
headers={"Accept": "_/_"},
)

data = response.json()

Get positions
This endpoint allows users to get current positions.

Copy
GET /api/v1/positions
Query Parameters
Field
Type
Need
Description
Example
"account"

string

required

Connected wallet address

42trU9A5...

Copy
/api/v1/positions?account=42trU9A5...
Response
Status 200: Successfully retrieved account information

Copy
{
"success": true,
"data": [
{
"symbol": "AAVE",
"side": "ask",
"amount": "223.72",
"entry_price": "279.283134",
"margin": "0", // only shown for isolated margin
"funding": "13.159593",
"isolated": false,
"created_at": 1754928414996,
"updated_at": 1759223365538
}
],
"error": null,
"code": null,
"last_order_id": 1557431179
}
Field
Type
Description
"symbol"

string

Trading pair symbol

"side"

string

Whether the position is long/short

"entry_price"

decimal string

Entry price of the position. Takes VWAP if position was opened by multiple trades executed at different prices.

"margin"

decimal string

Amount of margin allocated to an isolated position (only shown when isolated)

"funding"

decimal string

Funding paid by this position since open

"isolated"

boolean

If the position is opened in isolated margin mode

"created_at"

integer

Timestamp in milliseconds when these settings were adjusted from their default

"updated_at"

integer

Timestamp in milliseconds when these settings were last updated

"last_order_id"

integer

Exchange-wide nonce. Used to reliably determine exchange event ordering. Sequential and not subject to clock drift.

Status 400: Invalid request parameters

Status 401: Unauthorized access

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"/api/v1/positions?account=42trU9A5...",
headers={"Accept": "_/_"},
)

data = response.json()

Get account settings
This endpoint allows users to get account margin and leverage settings (if they are not at default values)

Copy
GET /api/v1/account/settings
Query Parameters
Field
Type
Need
Description
Example
"account"

string

required

Account address

42trU9A5...

Copy
/api/v1/account/settings?account=42trU9A5...
Response
NOTE: Upon account creation, all markets have margin settings default to cross margin and leverage default to max. When querying this endpoint, all markets with default margin and leverage settings on this account will return blank.

Status 200: Successfully retrieved account settings

Copy
{
"success": true,
"data": [
{
"symbol": "WLFI",
"isolated": false,
"leverage": 5,
"created_at": 1758085929703,
"updated_at": 1758086074002
}
],
"error": null,
"code": null
}
Field
Type
Description
"symbol"

string

Trading pair symbol

"isolated"

boolean

If the account is set to isolated margining for this symbol

"leverage"

integer

Current leverage set by the user (default to max)

"created_at"

integer

Timestamp in milliseconds when these settings were adjusted from their default

"updated_at"

integer

Timestamp in milliseconds when these settings were last updated

Status 400: Invalid request parameters

Status 401: Unauthorized access

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"/api/v1/account/settings?account=42trU9A5...",
headers={"Accept": "_/_"},
)

data = response.json()

Create market order
This endpoint allows users to create a new market order with optional take profit and stop loss levels.

Copy
POST /api/v1/orders/create_market
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"create_market_order"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"symbol"

string

required

Trading pair symbol

BTC

"amount"

string

required

Order amount

0.1

"side"

string

required

Order side (bid/ask)

bid

"slippage_percent"

string

required

Maximum slippage tolerance in percentage, e.g. "0.5" means 0.5% max slippage

0.5

"reduce_only"

boolean

required

Whether the order is reduce-only

false

"client_order_id"

Full UUID string

optional

Client-defined order ID

f47ac10b-58cc-4372-a567-0e02b2c3d479

"take_profit"

object

optional

Take profit stop order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

55000

"limit_price"

string

optional

Limit price for the triggered order

54950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

e36ac10b-58cc-4372-a567-0e02b2c3d479

"stop_loss"

object

optional

Stop loss order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

48000

"limit_price"

string

optional

Limit price for the triggered order

47950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

d25ac10b-58cc-4372-a567-0e02b2c3d479

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq",
"timestamp": 1716200000000,
"symbol": "BTC",
"amount": "0.1",
"side": "bid",
"slippage_percent": "0.5",
"reduce_only": false,
"client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
"take_profit": {
"stop_price": "55000",
"limit_price": "54950",
"client_order_id": "e36ac10b-58cc-4372-a567-0e02b2c3d479"
},
"stop_loss": {
"stop_price": "48000",
"limit_price": "47950",
"client_order_id": "d25ac10b-58cc-4372-a567-0e02b2c3d479"
},
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: Order created successfully

Copy
{
"order_id": 12345
}
Status 400: Bad request

Copy
{
"error": "Invalid order parameters",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"amount": "0.1",
"side": "bid",
"slippage_percent": 1,
"reduce_only": False,
"client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}

response = requests.post(
"/api/v1/orders/create_market",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()
Note: In order to protect liquidity providers from adverse selection, all market orders are subject to a ~200ms delay.

Create limit order
This endpoint allows users to create a new limit order with optional take profit and stop loss levels.

The Pacifica Python SDK provides a comprehensive example on using this endpoint.

Copy
POST /api/v1/orders/create
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"create_order"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"symbol"

string

required

Trading pair symbol

BTC

"price"

string

required

Order price

50000

"amount"

string

required

Order amount

0.1

"side"

string

required

Order side (bid/ask)

bid

"tif"

string

required

Time in force (GTC, IOC, ALO. TOB)

GTC

"reduce_only"

boolean

required

Whether the order is reduce-only

false

"client_order_id"

Full UUID string

optional

Client-defined order ID

f47ac10b-58cc-4372-a567-0e02b2c3d479

"take_profit"

object

optional

Take profit stop order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

55000

"limit_price"

string

optional

Limit price for the triggered order

54950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

e36ac10b-58cc-4372-a567-0e02b2c3d479

"stop_loss"

object

optional

Stop loss order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

48000

"limit_price"

string

optional

Limit price for the triggered order

47950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

d25ac10b-58cc-4372-a567-0e02b2c3d479

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq",
"timestamp": 1716200000000,
"symbol": "BTC",
"price": "50000",
"amount": "0.1",
"side": "bid",
"tif": "GTC",
"reduce_only": false,
"client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
"take_profit": {
"stop_price": "55000",
"limit_price": "54950",
"client_order_id": "e36ac10b-58cc-4372-a567-0e02b2c3d479"
},
"stop_loss": {
"stop_price": "48000",
"limit_price": "47950",
"client_order_id": "d25ac10b-58cc-4372-a567-0e02b2c3d479"
},
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: Order created successfully

Copy
{
"order_id": 12345
}
Status 400: Bad request

Copy
{
"error": "Invalid order parameters",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"price": "50000",
"amount": "0.1",
"side": "bid",
"tif": "GTC",
"reduce_only": False,
"client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}

response = requests.post(
"/api/v1/orders/create",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()
Note: In order to protect liquidity providers from adverse selection, all TIF GTC, and TIF IOC orders are subject to a ~200ms delay.

Get open orders
This endpoint allows users to get open orders on their account.

Copy
GET /api/v1/orders
Query Parameters
Field
Type
Need
Description
Example
"account"

string

required

Account address to filter orders

42trU9A5...

Copy
/api/v1/orders?account=42trU9A5...
Response
Status 200: Successfully retrieved open orders

Copy
{
"success": true,
"data": [
{
"order_id": 315979358,
"client_order_id": "add9a4b5-c7f7-4124-b57f-86982d86d479",
"symbol": "ASTER",
"side": "ask",
"price": "1.836",
"initial_amount": "85.33",
"filled_amount": "0",
"cancelled_amount": "0",
"stop_price": null,
"order_type": "limit",
"stop_parent_order_id": null,
"reduce_only": false,
"created_at": 1759224706737,
"updated_at": 1759224706737
}
],
"error": null,
"code": null,
"last_order_id": 1557370337
}
Field
Type
Description
"order_id"

integer

Order id assigned to order

"client_order_id"

UUID

CLOID of order if assigned by user

"symbol"

string

Trading pair symbol

"side"

string

Whether the order is a bid or an ask

"price"

decimal string

Price set by the order

"initial_amount"

decimal string

Amount (in token denomination) of the order placed

"filled_amount"

decimal string

Amount (in token denomination) of the order placed that has been filled

"cancelled_amount"

decimal string

Amount (in token denomination) of the order placed that has been cancelled

"stop_price"

decimal string

Stop price assigned upon order creation for subsequent position if order is filled if specified by user.

"order_type"

string

"limit"
"market"
"stop_limit"
"stop_market"
"take_profit_limit"
"stop_loss_limit"
"take_profit_market"
"stop_loss_market"

"stop_parent_order_id"

integer

Order id of stop order attached to original order

"reduce_only"

boolean

If the order is reduce only

"created_at"

integer

Timestamp in milliseconds when the order was created on Pacifica

"updated_at"

integer

Timestamp in milliseconds when the order was last modified (by a fill)

"last_order_id"

integer

Exchange-wide nonce. Used to reliably determine exchange event ordering. Sequential and not subject to clock drift.

Status 400: Invalid request parameters

Status 401: Unauthorized access

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"/api/v1/orders?account=42trU9A5...",
headers={"Accept": "_/_"},
)

data = response.json()

Cancel order
This endpoint allows users to cancel an existing order.

The Pacifica Python SDK provides a comprehensive example on using this endpoint.

Copy
POST /api/v1/orders/cancel
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"cancel_order"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"symbol"

string

required

Trading pair symbol

BTC

"order_id"

integer

required (if no CLOID)

Exchange-assigned order ID

123

"client_order_id"

Full UUID string

required (if no OID)

Client-defined order ID

f47ac10b-58cc-4372-a567-0e02b2c3d479

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"order_id": 123,
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: Order cancelled successfully

Copy
{
"success": true
}
Status 400: Bad request

Copy
{
"error": "Order not found",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"order_id": 123
}

response = requests.post(
"/api/v1/orders/cancel",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()
Cancel requests are not affected by any speedbumps.

Cancel all orders
This endpoint allows users to cancel all orders for all/given symbol(s).

The Pacifica Python SDK provides a comprehensive example on using this endpoint

Copy
POST /api/v1/orders/cancel_all
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"cancel_all_orders"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"all_symbols"

boolean

required

Whether to cancel orders for all symbols

true

"exclude_reduce_only"

boolean

required

Whether to exclude reduce-only orders

false

"symbol"

string

required
(if all_symbols is false)

Trading pair symbol

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"all_symbols": true,
"exclude_reduce_only": false,
"symbol": "BTC",
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: All orders cancelled successfully

Copy
{
"cancelled_count": 5
}
Status 400: Bad request

Copy
{
"error": "Invalid parameters",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"all_symbols": True,
"exclude_reduce_only": False
}

response = requests.post(
"/api/v1/orders/cancel_all",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()

Prices
Streams all symbols' price information on Pacifica as they update

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "prices"
}
}
Stream

Copy
{
"channel": "prices",
"data": [
{
"funding": "0.0000125",
"mark": "105473",
"mid": "105476",
"next_funding": "0.0000125",
"open_interest": "0.00524",
"oracle": "105473",
"symbol": "BTC",
"timestamp": 1749051612681,
"volume_24h": "63265.87522",
"yesterday_price": "955476"
}
// ... other symbol prices
],
}
Field
Type
Description
'funding'

decimal string

Funding rate

'mark'

decimal string

Mark price

'timestamp'

number

Timestamp in milliseconds

'mid'

decimal string

Mid price

'next_funding'

decimal string

Next funding rate

'open_interest'

decimal string

Open interest amount

'oracle'

decimal string

Oracle price

'symbol'

string

Symbol

'volume_24h'

decimal string

24 hour volume in USD

'yesterday_price'

decimal string

Previous day price

Account positions
Streams all changes made to an account's positions in any market. A position that has been fully closed will be streamed and return empty.

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "account_positions",
"account": "42trU9A5..."
}
}
Initialization Snapshot
Upon subscription, the account positions websocket immediately returns a snapshot of all current positions, then begins streams all changes made to an account's positions.

Stream

Copy
{
"channel": "subscribe",
"data": {
"source": "account_positions",
"account": "BrZp5..."
}
}
// this is the initialization snapshot
{
"channel": "account_positions",
"data": [
{
"s": "BTC",
"d": "bid",
"a": "0.00022",
"p": "87185",
"m": "0",
"f": "-0.00023989",
"i": false,
"l": null,
"t": 1764133203991
}
],
"li": 1559395580
}
// this shows the position being increased by an order filling
{
"channel": "account_positions",
"data": [
{
"s": "BTC",
"d": "bid",
"a": "0.00044",
"p": "87285.5",
"m": "0",
"f": "-0.00023989",
"i": false,
"l": "-95166.79231",
"t": 1764133656974
}
],
"li": 1559412952
}
// this shows the position being closed
{
"channel": "account_positions",
"data": [],
"li": 1559438203
}
Field
Type
Description
's'

string

Symbol

'd'

string

Position side (bid, ask)

'a'

decimal string

Position amount

'p'

decimal string

Average entry price

'm'

decimal string

Position margin

'f'

decimal string

Position funding fee

'i'

bool

Is position isolated?

'l'

decimal string

Liquidation price in USD (null if not applicable)

't'

number

Timestamp in milliseconds

'li'

number

Exchange-wide nonce. Used to reliably determine exchange event ordering. Sequential and not subject to clock drift.

Account orders
Streams all changes made to an account's open orders in any market. An order that has been cancelled/filled will be streamed and return empty.

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "account_orders",
"account": "42trU9A5..."
}
}
Stream

Copy
{
"channel": "account_orders",
"data": [
{
"i": 1559506586,
"I": null,
"s": "BTC",
"d": "bid",
"p": "80000",
"a": "0.00013",
"f": "0",
"c": "0",
"t": 1765016203314,
"st": null,
"ot": "limit",
"sp": null,
"ro": false
}
],
"li": 1559525416
}
Field
Type
Description
'i'

integer

Order ID

'I'

Full UUID string

Client order ID

's'

string

Symbol

'd'

string

Side: [bid, ask]

'p'

decimal string

Average filled price

'a'

decimal string

Original amount

'f'

decimal string

Filled amount

'c'

decimal string

Cancelled amount

't'

integer

Timestamp (milliseconds)

'st'

string

Stop type (TP/SL)

'ot'

string

Order type [market, limit]

'sp'

string

Stop price

'ro'

bool

Reduce only

'li'

integer

Exchange-wide nonce. Used to reliably determine exchange event ordering. Sequential and not subject to clock drift.

Trades
Streams all trades on the taker side as they occur in a chosen market.

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "trades",
"symbol": "SOL"
}
}
Stream

Copy
{
"channel": "trades",
"data": [
{
"u": "42trU9A5...",
"h": 80062522,
"s": "BTC",
"a": "0.00001",
"p": "89471",
"d": "close_short",
"tc": "normal",
"t": 1765018379085,
"li": 1559885104
}
]
}
Field
Type
Description
'u'

string

Account address

'h'

integer

History ID

's'

string

Symbol

'a'

decimal string

Amount

'p'

decimal string

Price

'd'

string

Trade side

open_long

open_short

close_long

close_short

'tc'

string

Trade cause

normal market_liquidation backstop_liquidation settlement

't'

number

Timestamp in milliseconds

'li'

number

Exchange-wide nonce. Used to reliably determine exchange event ordering. Sequential and not subject to clock drift.

Get recent trades
This endpoint allows users to get recent trades for a specific market.

Copy
GET /api/v1/trades
Query Parameters
Field
Type
Need
Description
Example
"symbol"

string

required

Trading pair symbol

BTC

Copy
/api/v1/trades?symbol=BTC
Response
Status 200: Successfully retrieved recent trades

Copy
{
"success": true,
"data": [
{
"event_type": "fulfill_taker",
"price": "104721",
"amount": "0.0001",
"side": "close_long",
"cause": "normal",
"created_at": 1765006315306
}
],
"error": null,
"code": null,
"last_order_id": 1557404170
}
Field
Type
Description
'event_type'

string

"fulfill_taker" if maker
"fulfill_maker" if taker

'price'

decimal string

Price in USD at which trade event has occurred

'amount'

decimal string

Amount in token denomination for which the trade has occurred for.

'side'

string

"open_long"
"open_short"
"close_long"
"close_short"

'cause'

string

"normal"
regular user-initiated trading
"market_liquidation" position was liquidated due to insufficient margin
"backstop_liquidation" position was liquidated by backstop mechanism
"settlement"
position was closed due to Auto-Deleveraging (ADL) or other settlement

'created_at'

integer

Timestamp in milliseconds of trade event

'last_order_id'

integer

Exchange-wide nonce. Used to reliably determine exchange event ordering. Sequential and not subject to clock drift.

Status 400: Invalid request parameters

Status 401: Unauthorized access

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"/api/v1/trades?symbol=BTC",
headers={"Accept": "_/_"},
)

data = response.json()

Create position TP/SL
This endpoint allows users to set take profit and stop loss levels for an existing position.

Copy
POST /api/v1/positions/tpsl
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"set_position_tpsl"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"symbol"

string

required

Trading pair symbol

BTC

"side"

string

required

Order side (bid/ask)

bid

"take_profit"

object

optional (if there is SL)

Take profit stop order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

55000

"limit_price"

string

optional

Limit price for the triggered order

54950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

e36ac10b-58cc-4372-a567-0e02b2c3d479

"stop_loss"

object

optional (if there is TP)

Stop loss order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

48000

"limit_price"

string

optional

Limit price for the triggered order

47950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

d25ac10b-58cc-4372-a567-0e02b2c3d479

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"side": "bid",
"take_profit": {
"stop_price": "55000",
"limit_price": "54950",
"client_order_id": "e36ac10b-58cc-4372-a567-0e02b2c3d479"
},
"stop_loss": {
"stop_price": "48000",
"limit_price": "47950",
"client_order_id": "d25ac10b-58cc-4372-a567-0e02b2c3d479"
},
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: Take profit and stop loss set successfully

Copy
{
"success": true
}
Status 400: Bad request

Copy
{
"error": "Position not found",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"side": "bid",
"take_profit": {
"stop_price": "55000",
"limit_price": "54950"
},
"stop_loss": {
"stop_price": "48000",
"limit_price": "47950"
}
}

response = requests.post(
"/api/v1/positions/tpsl",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()

Account leverage
Streams all changes made to an account's max leverage any market.

Refer to Websocket for establishing the websocket connection.

Leverage
Params

Copy
{
"method": "subscribe",
"params": {
"source": "account_leverage",
"account": "42trU9A5..."
}
}
Stream

Copy
{
"channel": "account_leverage",
"data": {
"u": "42trU9A5..."
"s": "BTC",
"l": "12",
"t": 1234567890
}
}
Field
Type
Description
'u'

string

Account address

's'

string

Symbol

'l'

integer string

New leverage

't'

number

Timestamp in milliseconds

Pacifica's builder program allows third-party developers (“builders”) to earn fees for orders they send on behalf of the users. These must be approved by the user before they can be used on any order. Once approved, the builder may include the code in any supported order creation request. Users can revoke access at any time.

Builder codes affect only Pacifica’s order fee logic and are fully verified by the API according to user approval, fee limits, and builder configuration.

We’re setting aside up to a total of 10,000,000 points over the next three months to reward teams building on Pacifica with Builder Program (December 11th, 2025 → March 11th, 2026).

Builder Program Rewards will be distributed based on each team’s contribution to Pacifica’s growth. To ensure fairness and meaningful impact within the ecosystem, an evaluation process will be conducted. Only teams that make significant contributions to Pacifica’s development will be eligible to receive point rewards.

Step 1: Request User Authorization
Request the user to authorize placing orders with your builder code by prompting them to sign an approval request containing your builder code as builder_code and the additional fee rate you want to charge as max_fee_rate.

Important: The user's max_fee_rate must be greater than or equal to your builder's fee_rate. If they set a lower value, orders will be rejected.

Data to be Signed

To approve a builder code, the user signs:

Copy
{
"timestamp": <ms>,
"expiry_window": 5000,
"type": "approve_builder_code",
"data": {
"builder_code": "YOUR_CODE",
"max_fee_rate": "0.001"
}
}
After following the signing implementation, compact and sort this payload recursively to generate the signature.

Complete Payload (After Signing)

Copy
{
"account": "6ETn....",
"agent_wallet": null,
"signature": "5j1Vy9UqYUF2jKD9r2Lv5AoMWHJuW5a1mqVzEhC9SJL5GqbPkGEQKpW3UZmKXr4UWrHMJ5xHQFMJkZWE8J5VyA",
"timestamp": 1748970123456,
"expiry_window": 5000,
"builder_code": "YOUR_CODE",
"max_fee_rate": "0.001"
}
Endpoint: POST https://api.pacifica.fi/api/v1/account/builder_codes/approve

Check User Approvals (Optional)

You can query which builder codes a user has approved:

Endpoint: GET https://api.pacifica.fi/api/v1/account/builder_codes/approvals?account=6ETn....

Response:

Copy
[
{
"builder_code": "YOUR_CODE",
"description": "Test Builder Integration",
"max_fee_rate": "0.001",
"updated_at": 1748970123456
}
]
Revoke Builder Code Authorization (Optional)

Users can revoke authorization at any time:

Data to be Signed

Copy
{
"timestamp": 1748970123456,
"expiry_window": 5000,
"type": "revoke_builder_code",
"data": {
"builder_code": "YOUR_CODE"
}
}
Complete Payload (After Signing)

Copy
{
"account": "6ETnufiec2CxVWTS4u5Wiq33Zh5Y3Qm6Pkdpi375fuxP",
"agent_wallet": null,
"signature": "5j1Vy9UqYUF2jKD9r2Lv5AoMWHJuW5a1mqVzEhC9SJL5GqbPkGEQKpW3UZmKXr4UWrHMJ5xHQFMJkZWE8J5VyA",
"timestamp": 1748970123456,
"expiry_window": 5000,
"builder_code": "YOUR_CODE"
}
Endpoint: POST https://api.pacifica.fi/api/v1/account/builder_codes/revoke

Step 2: Include Builder Code in Order Creation Requests
All order creation requests may now include your builder code in the builder_code parameter. Update the following endpoints:

REST API:

POST /api/v1/orders/create_market

POST /api/v1/orders/create

POST /api/v1/orders/stop/create

POST /api/v1/positions/tpsl

WebSocket:

create_market_order

create_limit_order

create_stop_order

set_position_tpsl

Example: Create Market Order with Builder Code

Data to be Signed

Copy
{
"timestamp": 1716200000000,
"expiry_window": 30000,
"type": "create_market_order",
"data": {
"symbol": "BTC",
"amount": "0.1",
"side": "bid",
"slippage_percent": "0.5",
"reduce_only": false,
"client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
"builder_code": "YOUR_CODE"
}
}
Complete Payload (After Signing)

Copy
{
"account": "6ETnufiec2CxVWTS4u5Wiq33Zh5Y3Qm6Pkdpi375fuxP",
"agent_wallet": null,
"signature": "5j1Vy9UqYUF2jKD9r2Lv5AoMWHJuW5a1mqVzEhC9SJL5GqbPkGEQKpW3UZmKXr4UWrHMJ5xHQFMJkZWE8J5VyA",
"timestamp": 1716200000000,
"expiry_window": 30000,
"symbol": "BTC",
"amount": "0.1",
"side": "bid",
"slippage_percent": "0.5",
"reduce_only": false,
"client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
"builder_code": "YOUR_CODE"
}
Endpoint: POST https://api.pacifica.fi/api/v1/orders/create_market

Example: Create Limit Order with Builder Code

Data to be Signed

Copy
{
"timestamp": 1716200000000,
"expiry_window": 30000,
"type": "create_order",
"data": {
"symbol": "BTC",
"amount": "0.1",
"side": "bid",
"tick_level": 1000,
"tif": "gtc",
"reduce_only": false,
"client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
"builder_code": "YOUR_CODE"
}
}
Endpoint: POST https://api.pacifica.fi/api/v1/orders/create

Example: Set Position TP/SL with Builder Code

Data to be Signed

Copy
{
"timestamp": 1716200000000,
"expiry_window": 30000,
"type": "set_position_tpsl",
"data": {
"symbol": "BTC",
"side": "bid",
"take_profit": {
"stop_price": "55000",
"limit_price": "54950",
"client_order_id": "e36ac10b-58cc-4372-a567-0e02b2c3d479"
},
"stop_loss": {
"stop_price": "48000",
"limit_price": "47950",
"client_order_id": "d25ac10b-58cc-4372-a567-0e02b2c3d479"
},
"builder_code": "YOUR_CODE"
}
}
Complete Payload (After Signing)

Copy
{
"account": "6ETnufiec2CxVWTS4u5Wiq33Zh5Y3Qm6Pkdpi375fuxP",
"agent_wallet": null,
"signature": "5j1Vy9UqYUF2jKD9r2Lv5AoMWHJuW5a1mqVzEhC9SJL5GqbPkGEQKpW3UZmKXr4UWrHMJ5xHQFMJkZWE8J5VyA",
"timestamp": 1716200000000,
"expiry_window": 30000,
"symbol": "BTC",
"side": "bid",
"take_profit": {
"stop_price": "55000",
"limit_price": "54950",
"client_order_id": "e36ac10b-58cc-4372-a567-0e02b2c3d479"
},
"stop_loss": {
"stop_price": "48000",
"limit_price": "47950",
"client_order_id": "d25ac10b-58cc-4372-a567-0e02b2c3d479"
},
"builder_code": "YOUR_CODE"
}
Endpoint: POST https://api.pacifica.fi/api/v1/positions/tpsl

Note: builder_code is provided only at the top level for TP/SL creation, not within individual take_profit or stop_loss objects.

Implementation Notes
Signature Generation: Follow the standard signing implementation for all requests

Builder Code Placement: The builder_code must be included in the data object when creating the payload to be signed

Recursive Sorting: All JSON keys must be recursively sorted alphabetically before creating the compact JSON string

Timestamps: All times are in milliseconds

Expiry Window: Defaults to 30 seconds (30,000 ms) if not specified

Backwards Compatibility: The builder_code field is optional on all order creation endpoints

Validation: Orders with builder codes will be rejected if:

The builder code doesn't exist

The user hasn't approved the builder code

The user's max_fee_rate is less than the builder's fee_rate

Referral Code Claim
Users can claim a referral code to establish a referral relationship with the code's owner. Referral codes can optionally generate and claim access codes automatically, providing both referral tracking and whitelist access in one action.

How It Works
Step 1: Request User Authorization

Request the user to authorize claiming a referral code by prompting them to sign an approval request containing the referral code.

Data to be Signed

Copy
{
"timestamp": <ms>,
"expiry_window": 5000,
"type": "claim_referral_code",
"data": {
"code": "YOUR_CODE"
}
}
After following the signing implementation, compact and sort this payload recursively to generate the signature.

Complete Payload (After Signing)

Copy
{
"account": "6ETn....",
"agent_wallet": null,
"signature": "5jHM.....",
"timestamp": 1748970123456,
"expiry_window": 5000,
"code": "YOUR_CODE"
}
Endpoint: POST https://api.pacifica.fi/api/v1/referral/user/code/claim

Error Handling
Common Error Codes:

403 Unauthorized: User hasn't approved the builder code or max_fee_rate is too low

404 Not Found: Builder code doesn't exist

400 Bad Request: Invalid builder code format (must be alphanumeric, max 16 characters)

Full Details and Onboarding
For more Pacifica Builder Program specs and details, as well as to onboard to the program, please reach out to us at ops@pacifica.fi, open a support ticket on our Discord or text @PacificaTGPortalBot on telegram.

Get order history
This endpoint allows users to get a summarized order history.

Copy
GET /api/v1/orders/history
Query Parameters
Field
Type
Need
Description
Example
"account"

string

required

Account address to filter orders

42trU9A5...

"limit"

integer

optional

Maximum number of records to return, default to 100

100

"cursor"

string

optional

Cursor pagination to access records. Default to none

1115hVka

Copy
/api/v1/orders/history?account=42trU9A5...&limit=100
Response
Status 200: Successfully retrieved order history

Copy
{
"success": true,
"data": [
{
"order_id": 315992721,
"client_order_id": "ade",
"symbol": "XPL",
"side": "ask",
"initial_price": "1.0865",
"average_filled_price": "0",
"amount": "984",
"filled_amount": "0",
"order_status": "open",
"order_type": "limit",
"stop_price": null,
"stop_parent_order_id": null,
"reduce_only": false,
"reason": null,
"created_at": 1759224893638,
"updated_at": 1759224893638
},
...
],
"next_cursor": "1111Hyd74",
"has_more": true
}
Field
Type
Description
"order_id"

integer

Order id assigned to order

"client_order_id"

UUID

CLOID of order if assigned by user

"symbol"

string

Trading pair symbol

"side"

string

Whether the order is a bid or an ask

"price"

decimal string

Price set by the order

"initial_price"

decimal string

Amount (in token denomination) of the order placed

"average_filled_price"

decimal string

VWAP of price at which the order was filled at

"amount"

decimal string

Amount (in token denomination) of the order placed

"filled_amount"

decimal string

Amount (in token denomination) of the order placed that was filled

"order_status"

string

"open"
"partially_filled"
"filled"
"cancelled"
"rejected"

"order_type"

string

"limit"
"market"
"stop_limit"
"stop_market"
"take_profit_limit"
"stop_loss_limit"
"take_profit_market"
"stop_loss_market"

"stop_price"

decimal string

Stop price assigned upon order creation for subsequent position if order is filled if specified by user.

"stop_parent_order_id"

integer

Order id of stop order attached to original order

"reduce_only"

boolean

If the order is reduce only

"reason"

string

Provides reason for an order being "cancelled" or "rejected":
"cancel"
"force_cancel"
"expired"
"post_only_rejected"
"self_trade_prevented"

"created_at"

integer

Timestamp in milliseconds when the order was created on Pacifica

"updated_at"

integer

Timestamp in milliseconds when any of the order was last modified

'next_cursor'

string

Next cursor for pagination

'has_more'

boolean

True if there exists a 'next_cursor'

Status 400: Invalid request parameters

Status 401: Unauthorized access

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"/api/v1/orders/history?account=42trU9A5...&limit=100",
headers={"Accept": "_/_"},
)

data = response.json()
Previous
Get open orders
Next

Get order history by ID
This endpoint allows users to get order history by id.

Copy
GET /api/v1/orders/history_by_id
Query Parameters
Field
Type
Need
Description
Example
"order_id"

integer

required

Order ID to retrieve history for

13753364

Copy
/api/v1/orders/history_by_id?order_id=13753364
Response
Status 200: Successfully retrieved open orders

Copy
{
"success": true,
"data": [
{
"history_id": 641452639,
"order_id": 315992721,
"client_order_id": "ade1aa6...",
"symbol": "XPL",
"side": "ask",
"price": "1.0865",
"initial_amount": "984",
"filled_amount": "0",
"cancelled_amount": "984",
"event_type": "cancel",
"order_type": "limit",
"order_status": "cancelled",
"stop_price": null,
"stop_parent_order_id": null,
"reduce_only": false,
"created_at": 1759224895038
},
{
"history_id": 641452513,
"order_id": 315992721,
"client_order_id": "ade1aa6...",
"symbol": "XPL",
"side": "ask",
"price": "1.0865",
"initial_amount": "984",
"filled_amount": "0",
"cancelled_amount": "0",
"event_type": "make",
"order_type": "limit",
"order_status": "open",
"stop_price": null,
"stop_parent_order_id": null,
"reduce_only": false,
"created_at": 1759224893638
}
],
"error": null,
"code": null
}
Field
Type
Description
"history_id"

integer

History ID assigned to the order

"order_id"

integer

Order ID assigned to order

"client_order_id"

UUID

CLOID of order if assigned by user

"symbol"

string

Trading pair symbol

"side"

string

Whether the order is a bid or an ask

"price"

decimal string

Price set by the order

"initial_amount"

decimal string

Amount (in token denomination) of the order placed

"filled_amount"

decimal string

Amount (in token denomination) of the order placed that was filled

"cancelled_amount"

decimal string

Amount (in token denomination) of the order placed that was cancelled

"event_type"

decimal string

Make if user was on maker side.
Take if on taker.

"order_type"

string

"limit"
"market"
"stop_limit"
"stop_market"
"take_profit_limit"
"stop_loss_limit"
"take_profit_market"
"stop_loss_market"

"order_status"

string

"open"
"partially_filled"
"filled"
"cancelled"
"rejected"

"stop_price"

decimal string

Stop price assigned upon order creation for subsequent position if order is filled if specified by user.

"stop_parent_order_id"

integer

Order id of stop order attached to original order

"reduce_only"

boolean

If the order is reduce only

"created_at"

integer

Timestamp in milliseconds when the order was created on Pacifica

Status 400: Invalid request parameters

Status 401: Unauthorized access

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"/api/v1/orders/history*by_id?order_id=13753364",
headers={"Accept": "*/\_"},
)

data = response.json()

Batch order
This endpoint allows users to submit multiple order operations in a single request. Batched orders are executed in the order they are batched in, and will not be split up by other users' orders.

The Pacifica Python SDK provides a comprehensive example on using this endpoint

Copy
POST /api/v1/orders/batch
Operation Type (for signing)
Header Field
Type
Content
None

-

Batch orders are not signed as a whole, but rather by its individual actions components.

Request Body
Field
Type
Need
Description
Example
"actions"

array

required

List of order actions to perform

Each action has an "type" field and action-specific "data"

See next two rows

"type"

string

required

Specifies type of action. This is DIFFERENT to the "type" used in signature headers

"Create"
"Cancel"

(case sensitive)

"data"

object

required

Contains signed request payloads of individual "Create" or "Cancel" actions

See code block below. Messages and corresponding fields are identical to create and cancel requests.

Copy
{
"actions":[
{
"type":"Create",
"data":{
"account":"42trU9A5...",
"signature":"5UpRZ14Q...",
"timestamp":1749190500355,
"expiry_window":5000,
"symbol":"BTC",
"price":"100000",
"reduce_only":false,
"amount":"0.1",
"side":"bid",
"tif":"GTC",
"client_order_id":"57a5efb1-bb96-49a5-8bfd-f25d5f22bc7e"
}
},
{
"type":"Cancel",
"data":{
"account":"42trU9A5...",
"signature":"4NDFHyTG...",
"timestamp":1749190500355,
"expiry_window":5000,
"symbol":"BTC",
"order_id":42069
}
}
]
}
Response
Status 200: Batch operations processed successfully

Copy
{
"success": true,
"data": {
"results": [
{
"success": true,
"order_id": 470506,
"error": null
},
{
"success": true,
}
]
},
"error": null,
"code": null
}
Status 400: Bad request

Copy
{
"error": "Invalid batch operation parameters",
"code": 400
}
Status 500: Internal server error

Notes on Batch Ordering:
Speed Bump (Latency Protection)
Batch orders are subject to a conditional ~200ms delay to protect liquidity providers from adverse selection:

Speed bump is applied if the batch contains:

Market orders (CreateMarket)

Limit orders with TIF = GTC or IOC

Speed bump is NOT applied if the batch only contains:

Add Liquidity Only orders (TIF = ALO)

Top of Book orders (TIF = TOB)

Cancel operations

TP/SL operations

Signature Requirements
Each action in the batch must be individually signed

All signatures must be valid for the batch to process

Execution Behavior and Limits
Maximum 10 actions per batch request

Actions are executed atomically in the order provided

If one action fails, subsequent actions are still attempted

Previous
Edit order
Next
Get open orders

Edit order
This endpoint allows users to edit an existing limit order by modifying its size and/or price.

Copy
POST /api/v1/orders/edit
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"edit_order"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"symbol"

string

required

Trading pair symbol

BTC

"price"

string

required

Order price

50000

"amount"

string

required

Order amount

0.1

"order_id"

integer

required
(if no CLOID)

Exchange assigned order ID

123456789

"client_order_id"

Full UUID string

required
(if no OID)

Client-defined order ID

f47ac10b-58cc-4372-a567-0e02b2c3d479

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Note: You must provide either order_id OR client_order_id but not both.

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"price": "90000",
"amount": "0.5",
"order_id": 123456789,
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: Order created successfully

Copy
{
"order_id": 123498765
}
Status 400: Bad request

Copy
{
"success": false,
"error": "Order not found",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"price": "90000",
"amount": "0.5",
"order_id": 123456789
}

response = requests.post(
"/api/v1/orders/edit",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()
Notes: Editing an order cancels the original and creates a new one. The new order maintains the same side, reduce-only status, and client_order_id (if provided), is created with TIF = ALO (Post Only), and receives a new system-assigned order_id.

Edit order is not subject to the taker speedbump.

Cancel stop order
This endpoint allows users to cancel a stop order by its (CL)OID.

Copy
POST /api/v1/orders/stop/cancel
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"cancel_stop_order"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"symbol"

string

required

Trading pair symbol

BTC

"order_id"

integer

required (if no CLOID)

Exchange-assigned order ID

123

"client_order_id"

Full UUID string

required (if no OID)

Client-defined order ID

f47ac10b-58cc-4372-a567-0e02b2c3d479

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"order_id": 123,
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: Stop order cancelled successfully

Copy
{
"success": true
}
Status 400: Bad request

Copy
{
"error": "Stop order not found",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"order_id": 123
}

response = requests.post(
"/api/v1/orders/stop/cancel",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()

Cancel all orders
This endpoint allows users to cancel all orders for all/given symbol(s).

The Pacifica Python SDK provides a comprehensive example on using this endpoint

Copy
POST /api/v1/orders/cancel_all
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"cancel_all_orders"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"all_symbols"

boolean

required

Whether to cancel orders for all symbols

true

"exclude_reduce_only"

boolean

required

Whether to exclude reduce-only orders

false

"symbol"

string

required
(if all_symbols is false)

Trading pair symbol

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"all_symbols": true,
"exclude_reduce_only": false,
"symbol": "BTC",
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: All orders cancelled successfully

Copy
{
"cancelled_count": 5
}
Status 400: Bad request

Copy
{
"error": "Invalid parameters",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"all_symbols": True,
"exclude_reduce_only": False
}

response = requests.post(
"/api/v1/orders/cancel_all",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()

Cancel order
This endpoint allows users to cancel an existing order.

The Pacifica Python SDK provides a comprehensive example on using this endpoint.

Copy
POST /api/v1/orders/cancel
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"cancel_order"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"symbol"

string

required

Trading pair symbol

BTC

"order_id"

integer

required (if no CLOID)

Exchange-assigned order ID

123

"client_order_id"

Full UUID string

required (if no OID)

Client-defined order ID

f47ac10b-58cc-4372-a567-0e02b2c3d479

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"order_id": 123,
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: Order cancelled successfully

Copy
{
"success": true
}
Status 400: Bad request

Copy
{
"error": "Order not found",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"order_id": 123
}

response = requests.post(
"/api/v1/orders/cancel",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()

Create position TP/SL
This endpoint allows users to set take profit and stop loss levels for an existing position.

Copy
POST /api/v1/positions/tpsl
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"set_position_tpsl"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"symbol"

string

required

Trading pair symbol

BTC

"side"

string

required

Order side (bid/ask)

bid

"take_profit"

object

optional (if there is SL)

Take profit stop order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

55000

"limit_price"

string

optional

Limit price for the triggered order

54950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

e36ac10b-58cc-4372-a567-0e02b2c3d479

"stop_loss"

object

optional (if there is TP)

Stop loss order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

48000

"limit_price"

string

optional

Limit price for the triggered order

47950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

d25ac10b-58cc-4372-a567-0e02b2c3d479

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"side": "bid",
"take_profit": {
"stop_price": "55000",
"limit_price": "54950",
"client_order_id": "e36ac10b-58cc-4372-a567-0e02b2c3d479"
},
"stop_loss": {
"stop_price": "48000",
"limit_price": "47950",
"client_order_id": "d25ac10b-58cc-4372-a567-0e02b2c3d479"
},
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: Take profit and stop loss set successfully

Copy
{
"success": true
}
Status 400: Bad request

Copy
{
"error": "Position not found",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"side": "bid",
"take_profit": {
"stop_price": "55000",
"limit_price": "54950"
},
"stop_loss": {
"stop_price": "48000",
"limit_price": "47950"
}
}

response = requests.post(
"/api/v1/positions/tpsl",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()

Create stop order
This endpoint allows users to create stop order.

Copy
POST /api/v1/orders/stop/create
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"create_stop_order"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"symbol"

string

required

Trading pair symbol

BTC

"side"

string

required

Order side (bid/ask)

bid

"reduce_only"

boolean

required

Whether the order is reduce-only

false

"stop_order"

object

required

Stop order configuration

See next four rows

"stop_price"

string

required

Stop trigger price

48000

"limit_price"

string

optional

Limit price for the triggered order

47950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

d25ac10b-58cc-4372-a567-0e02b2c3d479

"amount"

string

required

Order amount

0.1

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"side": "long",
"reduce_only": true,
"stop_order": {
"stop_price": "48000",
"limit_price": "47950",
"client_order_id": "d25ac10b-58cc-4372-a567-0e02b2c3d479",
"amount": "0.1"
},
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: Stop order created successfully

Copy
{
"order_id": 12345
}
Status 400: Bad request

Copy
{
"error": "Invalid stop order parameters",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"side": "long",
"reduce_only": True,
"stop_order": {
"stop_price": "48000",
"limit_price": "47950",
"amount": "0.1"
}
}

response = requests.post(
"/api/v1/orders/stop/create",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json().

Create limit order
This endpoint allows users to create a new limit order with optional take profit and stop loss levels.

The Pacifica Python SDK provides a comprehensive example on using this endpoint.

Copy
POST /api/v1/orders/create
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"create_order"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"symbol"

string

required

Trading pair symbol

BTC

"price"

string

required

Order price

50000

"amount"

string

required

Order amount

0.1

"side"

string

required

Order side (bid/ask)

bid

"tif"

string

required

Time in force (GTC, IOC, ALO. TOB)

GTC

"reduce_only"

boolean

required

Whether the order is reduce-only

false

"client_order_id"

Full UUID string

optional

Client-defined order ID

f47ac10b-58cc-4372-a567-0e02b2c3d479

"take_profit"

object

optional

Take profit stop order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

55000

"limit_price"

string

optional

Limit price for the triggered order

54950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

e36ac10b-58cc-4372-a567-0e02b2c3d479

"stop_loss"

object

optional

Stop loss order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

48000

"limit_price"

string

optional

Limit price for the triggered order

47950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

d25ac10b-58cc-4372-a567-0e02b2c3d479

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq",
"timestamp": 1716200000000,
"symbol": "BTC",
"price": "50000",
"amount": "0.1",
"side": "bid",
"tif": "GTC",
"reduce_only": false,
"client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
"take_profit": {
"stop_price": "55000",
"limit_price": "54950",
"client_order_id": "e36ac10b-58cc-4372-a567-0e02b2c3d479"
},
"stop_loss": {
"stop_price": "48000",
"limit_price": "47950",
"client_order_id": "d25ac10b-58cc-4372-a567-0e02b2c3d479"
},
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: Order created successfully

Copy
{
"order_id": 12345
}
Status 400: Bad request

Copy
{
"error": "Invalid order parameters",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"price": "50000",
"amount": "0.1",
"side": "bid",
"tif": "GTC",
"reduce_only": False,
"client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}

response = requests.post(
"/api/v1/orders/create",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()
Note: In order to protect liquidity providers from adverse selection, all TIF GTC, and TIF IOC orders are subject to a ~200ms delay.

Previous
Create market order
Next
Create stop order

Create market order
This endpoint allows users to create a new market order with optional take profit and stop loss levels.

Copy
POST /api/v1/orders/create_market
Operation Type (for signing)
Header Field
Type
Content
"type"

string

"create_market_order"

Request Body
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"symbol"

string

required

Trading pair symbol

BTC

"amount"

string

required

Order amount

0.1

"side"

string

required

Order side (bid/ask)

bid

"slippage_percent"

string

required

Maximum slippage tolerance in percentage, e.g. "0.5" means 0.5% max slippage

0.5

"reduce_only"

boolean

required

Whether the order is reduce-only

false

"client_order_id"

Full UUID string

optional

Client-defined order ID

f47ac10b-58cc-4372-a567-0e02b2c3d479

"take_profit"

object

optional

Take profit stop order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

55000

"limit_price"

string

optional

Limit price for the triggered order

54950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

e36ac10b-58cc-4372-a567-0e02b2c3d479

"stop_loss"

object

optional

Stop loss order configuration

See next three rows

"stop_price"

string

required

Stop trigger price

48000

"limit_price"

string

optional

Limit price for the triggered order

47950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

d25ac10b-58cc-4372-a567-0e02b2c3d479

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Copy
{
"account": "42trU9A5...",
"signature": "5j1Vy9Uq",
"timestamp": 1716200000000,
"symbol": "BTC",
"amount": "0.1",
"side": "bid",
"slippage_percent": "0.5",
"reduce_only": false,
"client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
"take_profit": {
"stop_price": "55000",
"limit_price": "54950",
"client_order_id": "e36ac10b-58cc-4372-a567-0e02b2c3d479"
},
"stop_loss": {
"stop_price": "48000",
"limit_price": "47950",
"client_order_id": "d25ac10b-58cc-4372-a567-0e02b2c3d479"
},
"agent_wallet": "69trU9A5...",
"expiry_window": 30000
}
Response
Status 200: Order created successfully

Copy
{
"order_id": 12345
}
Status 400: Bad request

Copy
{
"error": "Invalid order parameters",
"code": 400
}
Status 500: Internal server error

Code Example (Python)

Copy
import requests

payload = {
"account": "42trU9A5...",
"signature": "5j1Vy9Uq...",
"timestamp": 1716200000000,
"symbol": "BTC",
"amount": "0.1",
"side": "bid",
"slippage_percent": 1,
"reduce_only": False,
"client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}

response = requests.post(
"/api/v1/orders/create_market",
json=payload,
headers={"Content-Type": "application/json"}
)

data = response.json()

Orderbook
Streams book data for given symbol at a set aggregation level as they update

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "book",
"symbol": "SOL",
"agg_level": 1 // Aggregation level
}
}
where agg_levelcan be one of 1, 2, 5, 10, 100, 1000.

Stream

Copy
{
"channel": "book",
"data": {
"l": [
[
{
"a": "37.86",
"n": 4,
"p": "157.47"
},
// ... other aggegated bid levels
],
[
{
"a": "12.7",
"n": 2,
"p": "157.49"
},
{
"a": "44.45",
"n": 3,
"p": "157.5"
},
// ... other aggregated ask levels
]
],
"s": "SOL",
"t": 1749051881187
}
}
The book websocket stream updates once every 100ms

Field
Type
Description
'l'

array

[Bids, Asks]

'a'

decimal string

Total amount in aggregation level.

'n'

integer

Number of orders in aggregation level.

'p'

decimal string

In bids array, this is highest price in aggregation level.

In asks array, this is lowest price is aggregation level

's'

string

Symbol

't'

number

Timestamp in milliseconds

Previous
Prices
Next
Best bid offer (BBO)
Last updated 1 month ago

Best bid offer (BBO)
Real-time updates of the best bid and ask prices and amounts for a specific symbol. Updates are sent whenever the top of book changes.

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "bbo",
"symbol": "BTC"
}
}
Stream

Copy
{
"channel": "bbo",
"data": {
"s": "BTC",
"i": 1234567890,
"t": 1764133203991,
"b": "87185",
"B": "1.234",
"a": "87186",
"A": "0.567"
}
}
Field
Type
Description
's'

string

Symbol

'i'

integer

Order id

't'

integer

Timestamp in milliseconds

'b'

decimal string

Best bid price

'B'

decimal string

Best bid amount (in token amount)

'a'

decimal string

Best ask price

'A'

decimal string

Best ask amount (in token amount)

Previous
Orderbook
Next
Trades

Trades
Streams all trades on the taker side as they occur in a chosen market.

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "trades",
"symbol": "SOL"
}
}
Stream

Copy
{
"channel": "trades",
"data": [
{
"u": "42trU9A5...",
"h": 80062522,
"s": "BTC",
"a": "0.00001",
"p": "89471",
"d": "close_short",
"tc": "normal",
"t": 1765018379085,
"li": 1559885104
}
]
}
Field
Type
Description
'u'

string

Account address

'h'

integer

History ID

's'

string

Symbol

'a'

decimal string

Amount

'p'

decimal string

Price

'd'

string

Trade side

open_long

open_short

close_long

close_short

'tc'

string

Trade cause

normal market_liquidation backstop_liquidation settlement

't'

number

Timestamp in milliseconds

'li'

number

Exchange-wide nonce. Used to reliably determine exchange event ordering. Sequential and not subject to clock drift.

Candle
Streams candle information for given symbol and candle time interval

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "candle",
"symbol": "SOL",
"interval": "1m"  
 }
}
Where "interval" can be 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 12h, 1d

Stream

Copy
{
"channel": "candle",
"data": {
"t": 1749052260000,
"T": 1749052320000,
"s": "SOL",
"i": "1m",
"o": "157.3",
"c": "157.32",
"h": "157.32",
"l": "157.3",
"v": "1.22",
"n": 8
}
}
Field
Type
Description
't'

number

Start time (milliseconds)

'T'

number

End time (milliseconds)

's'

string

Symbol

'i'

string

Candle interval

'o'

decimal string

Open price

'c'

decimal string

Close price

'h'

decimal string

High price

'l'

decimal string

Low price

'v'

decimal string

Volume

'n'

number

Number of trades in this period

Mark price candle
Streams real-time mark price candlestick data for a specific market.

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "mark_price_candle",
"symbol": "BTC",
"interval": "1m"
}
}
Where "interval" can be 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 12h, 1d

Stream

Copy
{
"channel": "mark_price_candle",
"data": {
"t": 1748954160000,
"T": 1748954220000,
"s": "BTC",
"i": "1m",
"o": "105376.500000",
"c": "105380.250000",
"h": "105385.750000",
"l": "105372.000000",
"v": "0",
"n": 0
}
}
Field
Type
Description
't'

number

Start time (milliseconds)

'T'

number

End time (milliseconds)

's'

string

Symbol

'i'

string

Candle interval

'o'

decimal string

Open mark price

'c'

decimal string

Close mark price

'h'

decimal string

High mark price

'l'

decimal string

Low mark price

'v'

decimal string

Volume (always "0")

'n'

number

Number of trades in this period

Account margin
Streams all changes made to an account's margin mode in any market.

Refer to Websocket for establishing the websocket connection.

Margin
Params

Copy
{
"method": "subscribe",
"params": {
"source": "account_margin",
"account": "42trU9A5..."
}
}
Stream

Copy
{
"channel": "account_margin",
"data": {
"u": "42trU9A5...",
"s": "ETH",
"i": true,
"t": 1234567890
}
}
Field
Type
Description
'u'

string

Account address

't'

number

Timestamp in milliseconds

's'

string

Symbol

'i'

boolean

New margin mode (isolated or not isolated)

Account leverage
Streams all changes made to an account's max leverage any market.

Refer to Websocket for establishing the websocket connection.

Leverage
Params

Copy
{
"method": "subscribe",
"params": {
"source": "account_leverage",
"account": "42trU9A5..."
}
}
Stream

Copy
{
"channel": "account_leverage",
"data": {
"u": "42trU9A5..."
"s": "BTC",
"l": "12",
"t": 1234567890
}
}
Field
Type
Description
'u'

string

Account address

's'

string

Symbol

'l'

integer string

New leverage

't'

number

Timestamp in milliseconds

Account info
Streams all changes made to an account's overall info such as equity, balance, order count, etc.

Refer to Websocket for establishing the websocket connection.

Leverage
Params

Copy
{
"method": "subscribe",
"params": {
"source": "account_info",
"account": "42trU9A5..."
}
}
Stream

Copy
{
"channel": "account_info",
"data": {
"ae": "2000",
"as": "1500",
"aw": "1400",
"b": "2000",
"f": 1,
"mu": "500",
"cm": "400",
"oc": 10,
"pb": "0",
"pc": 2,
"sc": 2,
"t": 1234567890
}
}
Field
Type
Description
'ae'

string

Account equity

'as'

string

Available to spend

'aw'

string

Availale to withdraw

'b'

string

Account balance

'f'

integer

Account fee tier

'mu'

string

Total margin used

'cm'

string

Maintenance margin required in cross mode

'oc'

integer

Orders count

'pb'

string

Pending balance

'pc'

integer

Positions count

'sc'

integer

Stop order count

't'

number

Timestamp in milliseconds

Account positions
Streams all changes made to an account's positions in any market. A position that has been fully closed will be streamed and return empty.

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "account_positions",
"account": "42trU9A5..."
}
}
Initialization Snapshot
Upon subscription, the account positions websocket immediately returns a snapshot of all current positions, then begins streams all changes made to an account's positions.

Stream

Copy
{
"channel": "subscribe",
"data": {
"source": "account_positions",
"account": "BrZp5..."
}
}
// this is the initialization snapshot
{
"channel": "account_positions",
"data": [
{
"s": "BTC",
"d": "bid",
"a": "0.00022",
"p": "87185",
"m": "0",
"f": "-0.00023989",
"i": false,
"l": null,
"t": 1764133203991
}
],
"li": 1559395580
}
// this shows the position being increased by an order filling
{
"channel": "account_positions",
"data": [
{
"s": "BTC",
"d": "bid",
"a": "0.00044",
"p": "87285.5",
"m": "0",
"f": "-0.00023989",
"i": false,
"l": "-95166.79231",
"t": 1764133656974
}
],
"li": 1559412952
}
// this shows the position being closed
{
"channel": "account_positions",
"data": [],
"li": 1559438203
}
Field
Type
Description
's'

string

Symbol

'd'

string

Position side (bid, ask)

'a'

decimal string

Position amount

'p'

decimal string

Average entry price

'm'

decimal string

Position margin

'f'

decimal string

Position funding fee

'i'

bool

Is position isolated?

'l'

decimal string

Liquidation price in USD (null if not applicable)

't'

number

Timestamp in milliseconds

'li'

number

Exchange-wide nonce. Used to reliably determine exchange event ordering. Sequential and not subject to clock drift.

Account orders
Streams all changes made to an account's open orders in any market. An order that has been cancelled/filled will be streamed and return empty.

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "account_orders",
"account": "42trU9A5..."
}
}
Stream

Copy
{
"channel": "account_orders",
"data": [
{
"i": 1559506586,
"I": null,
"s": "BTC",
"d": "bid",
"p": "80000",
"a": "0.00013",
"f": "0",
"c": "0",
"t": 1765016203314,
"st": null,
"ot": "limit",
"sp": null,
"ro": false
}
],
"li": 1559525416
}
Field
Type
Description
'i'

integer

Order ID

'I'

Full UUID string

Client order ID

's'

string

Symbol

'd'

string

Side: [bid, ask]

'p'

decimal string

Average filled price

'a'

decimal string

Original amount

'f'

decimal string

Filled amount

'c'

decimal string

Cancelled amount

't'

integer

Timestamp (milliseconds)

'st'

string

Stop type (TP/SL)

'ot'

string

Order type [market, limit]

'sp'

string

Stop price

'ro'

bool

Reduce only

'li'

integer

Exchange-wide nonce. Used to reliably determine exchange event ordering. Sequential and not subject to clock drift.

Account orders
Streams all changes made to an account's open orders in any market. An order that has been cancelled/filled will be streamed and return empty.

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "account_orders",
"account": "42trU9A5..."
}
}
Stream

Copy
{
"channel": "account_orders",
"data": [
{
"i": 1559506586,
"I": null,
"s": "BTC",
"d": "bid",
"p": "80000",
"a": "0.00013",
"f": "0",
"c": "0",
"t": 1765016203314,
"st": null,
"ot": "limit",
"sp": null,
"ro": false
}
],
"li": 1559525416
}
Field
Type
Description
'i'

integer

Order ID

'I'

Full UUID string

Client order ID

's'

string

Symbol

'd'

string

Side: [bid, ask]

'p'

decimal string

Average filled price

'a'

decimal string

Original amount

'f'

decimal string

Filled amount

'c'

decimal string

Cancelled amount

't'

integer

Timestamp (milliseconds)

'st'

string

Stop type (TP/SL)

'ot'

string

Order type [market, limit]

'sp'

string

Stop price

'ro'

bool

Reduce only

'li'

integer

Exchange-wide nonce. Used to reliably determine exchange event ordering. Sequential and not subject to clock drift.

Account trades
Streams all trades that take place for an account

Refer to Websocket for establishing the websocket connection.

Params

Copy
{
"method": "subscribe",
"params": {
"source": "account_trades",
"account": "42trU9A5..."
}
}
Stream

Copy
{
"channel": "account_trades",
"data": [
{
"h": 80063441,
"i": 1559912767,
"I": null,
"u": "BrZp5bidJ3WUvceSq7X78bhjTfZXeezzGvGEV4hAYKTa",
"s": "BTC",
"p": "89477",
"o": "89505",
"a": "0.00036",
"te": "fulfill_taker",
"ts": "close_long",
"tc": "normal",
"f": "0.012885",
"n": "-0.022965",
"t": 1765018588190,
"li": 1559912767
}
]
}
Field
Type
Description
'h'

integer

History ID

'i'

integer

Order ID

'I'

Full UUID string

Client order ID

'u'

sting

Account address

's'

string

Symbol

'p'

decimal string

Price

'o'

decimal string

Entry price

'a'

decimal string

Trade amount

'te'

string

'fulfill_maker' - provided liquidity
'fulfill_taker' - took liquidity

'ts'

string

Trade side

'tc'

string

'normal' - Regular trade
'market_liquidation' - liquidated by market order
'backstop_liquidation' - liquidated by backstop liquidator
'settlement' - ADL/settlement

'f'

decimal string

Trade fee

'n'

decimal string

PnL

't'

number

Timestamp in milliseconds

'li'

number

Exchange-wide nonce. Used to reliably determine exchange event ordering. Sequential and not subject to clock drift.

Create market order
This request type allows users to place market orders through Pacifica's websocket API.

The Pacifica Python SDK provides a comprehensive example on using this endpoint.

Request

Copy
{
"id": "660065de-8f32-46ad-ba1e-83c93d3e3966",
"params": {
"create_market_order": {
"account": "AwX6321...",
"signature": "5vnYpt...",
"timestamp": 1749223025396,
"expiry_window": 5000,
"symbol": "BTC",
"reduce_only": false,
"amount": "0.001",
"side": "bid",
"slippage_percent": "0.5",
"client_order_id": "79f948fd-7556-4066-a128-083f3ea49322"
}
}
}
Field
Type
Need
Description
Example
"id"

Full UUID string

required

Client-defined request ID

660065de-8f32-46ad-ba1e-83c93d3e3966

"params"

object

required

Contains action type and action parameters

"create_order"

"create_market_order"

object

required

Specifies action type and contains parameters

See examples.

"account"

string

required

User's wallet address

42trU9A5...

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

"symbol"

string

required

Trading pair symbol

BTC

"reduce_only"

boolean

required

Whether the order is reduce-only

false

"amount"

string

required

Order amount

0.1

"side"

string

required

Order side (bid/ask)

bid

"slippage_percent"

string

required

Maximum allowed slippage in percentage, e.g. "0.5" means 0.5% max slippage

0.5

"client_order_id"

Full UUID string

optional

Client-defined order ID

f47ac10b-58cc-4372-a567-0e02b2c3d479

"take_profit"

object

optional

Take profit stop order configuration

See next three rows

"stop_price"

string

required (if "take_profit" exists)

Stop trigger price

55000

"limit_price"

string

optional

Limit price for the triggered order

54950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

e36ac10b-58cc-4372-a567-0e02b2c3d479

"stop_loss"

object

optional

Stop loss order configuration

See next three rows

"stop_price"

string

required (if "stop_loss" exists)

Stop trigger price

48000

"limit_price"

string

optional

Limit price for the triggered order

47950

"client_order_id"

Full UUID string

optional

Client-defined order ID for the stop order

d25ac10b-58cc-4372-a567-0e02b2c3d479

Response

Copy
{
"code": 200,
"data": {
"I": "79f948fd-7556-4066-a128-083f3ea49322",
"i": 645953,
"s": "BTC"
},
"id": "660065de-8f32-46ad-ba1e-83c93d3e3966",
"t": 1749223025962,
"type": "create_market_order"
}
Field
Type
Description
'code'

integer

Status code

'data'

object

Contains information about placed order

'I'

string

CLOID (if provided)

'i'

integer

Order ID

's'

string

Symbol

'id'

string

Client-defined request ID

't'

integer

Timestamp in milliseconds

'type'

string

Specifies action type

Note: In order to protect liquidity providers from adverse selection, all market orders are subject to a ~200ms delay.

Create limit order
This request type allows users to place limit orders through Pacifica's websocket API.

The Pacifica Python SDK provides a comprehensive example on using this endpoint.

Request

Copy
{
"id": "660065de-8f32-46ad-ba1e-83c93d3e3966",
"params": {
"create_order": {
"account": "AwX6321...",
"signature": "5vnYpt...",
"timestamp": 1749223025396,
"expiry_window": 5000,
"symbol": "BTC",
"price": "100000.00",
"reduce_only": false,
"amount": "0.001",
"side": "bid",
"tif": "GTC",
"client_order_id": "79f948fd-7556-4066-a128-083f3ea49322"
}
}
}
Field
Type
Need
Description
Example
"id"

Full UUID string

required

Client-defined request ID

660065de-8f32-46ad-ba1e-83c93d3e3966

"params"

object

required

Contains action type and action parameters

"create_order"

"create_order"

object

required

Specifies action type and contains parameters

See examples.

"account"

string

required

User's wallet address

42trU9A5...

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

"symbol"

string

required

Trading pair symbol

BTC

"price"

string

required

Order price

50000

"reduce_only"

boolean

required

Whether the order is reduce-only

false

"amount"

string

required

Order amount

0.1

"side"

string

required

Order side (bid/ask)

bid

"tif"

string

required

Time in force (GTC, IOC, ALO, TOB)

GTC

"client_order_id"

Full UUID string

optional

Client-defined order ID

f47ac10b-58cc-4372-a567-0e02b2c3d479

"take_profit"

object

optional

Take profit stop order configuration

See next three rows

"stop_price"

string

required (if "take_profit" exists)

Stop trigger price

55000

"limit_price"

string

optional

Limit price for the triggered order

54950

"client_order_id"

string

Full UUID string

Client-defined order ID for the stop order

e36ac10b-58cc-4372-a567-0e02b2c3d479

"stop_loss"

object

optional

Stop loss order configuration

See next three rows

"stop_price"

string

required (if "stop_loss" exists)

Stop trigger price

48000

"limit_price"

string

optional

Limit price for the triggered order

47950

"client_order_id"

string

Full UUID string

Client-defined order ID for the stop order

d25ac10b-58cc-4372-a567-0e02b2c3d479

Response

Copy
{
"code": 200,
"data": {
"I": "79f948fd-7556-4066-a128-083f3ea49322",
"i": 645953,
"s": "BTC"
},
"id": "660065de-8f32-46ad-ba1e-83c93d3e3966",
"t": 1749223025962,
"type": "create_order"
}
Field
Type
Description
'code'

integer

Status code

'data'

object

Contains information about placed order

'I'

string

CLOID (if provided)

'i'

integer

Order ID

's'

string

Symbol

'id'

string

Client-defined request ID

't'

integer

Timestamp in milliseconds

'type'

string

Specifies action type

Note: In order to protect liquidity providers from adverse selection, all TIF GTC, and TIF IOC orders are subject to a ~200ms delay.

Edit order
This request type allows users to modify existing orders (price and/or size) through websocket API in one request.

The Pacifica Python SDK provides a comprehensive example on using this endpoint.

Request

Copy
{
"id": "660065de-8f32-46ad-ba1e-83c93d3e3966",
"params": {
"edit_order": {
"account": "AwX6321...",
"signature": "5vnYpt...",
"timestamp": 1749223025396,
"expiry_window": 5000,
"symbol": "BTC",
"price": "99500",
"amount": "0.002",
"order_id": 645953
}
}
}
Field
Type
Need
Description
Example
"id"

Full UUID string

required

Client-defined request ID

660065de-8f32-46ad-ba1e-83c93d3e3966

"params"

object

required

Contains action type and action parameters

"edit_order"

"edit_order"

object

required

Specifies action type and contains parameters

See examples.

"account"

string

required

User's wallet address

42trU9A5...

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

"symbol"

string

required

Trading pair symbol

BTC

"price"

string

required

Order price

99500

"amount"

string

required

Order amount

0.002

"order_id"

integer

optional

System-defined order ID (needed if no CLOID provided)

645953

"client_order_id"

Full UUID string

optional

Client-defined order ID (needed if no OID provided)

f47ac10b-58cc-4372-a567-0e02b2c3d479

Response

Copy
{
"code": 200,
"data": {
"I": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
"i": 645954,
"s": "BTC"
},
"id": "660065de-8f32-46ad-ba1e-83c93d3e3966",
"t": 1749223026150,
"type": "edit_order"
}
Field
Type
Description
'code'

integer

Status code

'data'

object

Contains information about placed order

'I'

string

CLOID (if original order contained one)

'i'

integer

New order ID

's'

string

Symbol

'id'

string

Client-defined request ID

't'

integer

Timestamp in milliseconds

'type'

string

Specifies action type

Notes: Editing an order cancels the original and creates a new one. The new order maintains the same side, reduce-only status, and client_order_id (if provided), is created with TIF = ALO (Post Only), and receives a new system-assigned order_id.

Edit order is not subject to the taker speedbump.

Batch order
This endpoint allows users to submit multiple order operations in a single websocket request.

The Pacifica Python SDK provides a comprehensive example on using this endpoint

Request

Copy
{
"id": "660065de-8f32-46ad-ba1e-83c93d3e3966",
"params": {
"batch_orders": {
"actions": [
{
"type": "Create",
"data": {
"account": "42trU9A5...",
"signature": "5UpRZ14Q...",
"timestamp": 1749190500355,
"expiry_window": 5000,
"symbol": "BTC",
"price": "100000",
"reduce_only": false,
"amount": "0.1",
"side": "bid",
"tif": "GTC",
"client_order_id": "57a5efb1-bb96-49a5-8bfd-f25d5f22bc7e"
}
},
{
"type": "Cancel",
"data": {
"account": "42trU9A5...",
"signature": "4NDFHyTG...",
"timestamp": 1749190500355,
"expiry_window": 5000,
"symbol": "SOL",
"order_id": 42069
}
}
]
}
}
}
Field
Type
Need
Description
Example
"id"

Full UUID string

required

Client-defined request ID

660065de-8f32-46ad-ba1e-83c93d3e3966

"actions"

array

required

List of order actions to perform

Each action has an "type" field and action-specific "data"

See next two rows

"type"

string

required

Specifies type of action. This is DIFFERENT to the "type" used in signature headers

"Create"
"Cancel"

(case sensitive)

"data"

object

required

Contains signed request payloads of individual "Create" or "Cancel" actions

See code block below. Messages and corresponding fields are identical to create and cancel requests.

Response
Status 200: Batch operations processed successfully

Copy
{
"code": 200,
"data": {
"results": [
{
"success": true,
"order_id": 645953,
"client_order_id": "57a5efb1-bb96-49a5-8bfd-f25d5f22bc7e",
"symbol": "BTC"
},
{
"success": true,
"order_id": 645954,
"symbol": "ETH"
}
]
},
"id": "660065de-8f32-46ad-ba1e-83c93d3e3966",
"t": 1749223025962,
"type": "batch_orders"
}
Status 400: Bad request

Copy
{
"error": "Invalid batch operation parameters",
"code": 400
}
Status 500: Internal server error

Notes on Batch Ordering:
Speed Bump (Latency Protection)
Batch orders are subject to a conditional randomized 50-100ms delay to protect liquidity providers from adverse selection:

Speed bump is applied if the batch contains:

Market orders (CreateMarket)

Limit orders with TIF = GTC or IOC

Speed bump is NOT applied if the batch only contains:

Add Liquidity Only orders (TIF = ALO)

Top of Book orders (TIF = TOB)

Cancel operations

TP/SL operations

Signature Requirements
Each action in the batch must be individually signed

All signatures must be valid for the batch to process

Execution Behavior and Limits
Maximum 10 actions per batch request

Actions are executed atomically in the order provided

If one action fails, subsequent actions are still attempted

Cancel order
This request type allows users to cancel orders through Pacifica's websocket API.

The Pacifica Python SDK provides a comprehensive example on using this endpoint.

Request

Copy
{
"id": "1bb2b72f-f545-4938-8a38-c5cda8823675",
"params": {
"cancel_order": {
"account": "AwX6321...",
"signature": "4RqbgB...",
"timestamp": 1749223343149,
"expiry_window": 5000,
"symbol": "BTC",
"client_order_id": "79f948fd-7556-4066-a128-083f3ea49322"
}
}
}
Field
Type
Need
Description
Example
"id"

Full UUID string

required

Client-defined request ID

1bb2b72f-f545-4938-8a38-c5cda8823675

"params"

object

required

Contains action type and action parameters

"cancel_order"

"cancel_order"

object

required

Specifies action type and contains parameters

See examples.

"account"

string

required

User's wallet address

42trU9A5...

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

"symbol"

string

required

Trading pair symbol

BTC

"order_id"

integer

required (if no CLOID)

Exchange-assigned order ID

123

"client_order_id"

Full UUID string

required (if no OID)

Client-defined order ID

f47ac10b-58cc-4372-a567-0e02b2c3d479

Response

Copy
{
"code": 200,
"data": {
"I": "79f948fd-7556-4066-a128-083f3ea49322",
"i": null,
"s": "BTC"
},
"id": "1bb2b72f-f545-4938-8a38-c5cda8823675",
"t": 1749223343610,
"type": "cancel_order"
}
Field
Type
Description
'code'

integer

Status code

'data'

object

Contains information about placed order

'I'

string

CLOID (if provided)

'i'

integer

Order ID

's'

string

Symbol

'id'

string

Same as above request ID

't'

integer

Timestamp in milliseconds

'type'

string

Specifies action type

Cancel are not subject to any speedbump.

Cancel all orders
This request type allows users to cancel all orders through Pacifica's websocket API.

The Pacifica Python SDK provides a comprehensive example on using this endpoint.

Request

Copy
{
"id": "4e9b4edb-b123-4759-9250-d19db61fabcb",
"params": {
"cancel_all_orders": {
"account": "AwX6f3...",
"signature": "2XP8fz...",
"timestamp": 1749221927343,
"expiry_window": 5000,
"all_symbols": true,
"exclude_reduce_only": false
}
}
}
Field
Type
Need
Description
Example
"id"

Full UUID string

required

Client-defined request ID

1bb2b72f-f545-4938-8a38-c5cda8823675

"params"

object

required

Contains action type and action parameters

"cancel_all_orders"

"cancel_order"

object

required

Specifies action type and contains parameters

See examples.

"account"

string

required

User's wallet address

42trU9A5...

"agent_wallet"

string

optional

Agent wallet address

69trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

"all_symbols"

boolean

required

Whether to cancel orders for all symbols

true

"exclude_reduce_only"

boolean

required

Whether to exclude reduce-only orders

false

"symbol"

string

required
(if "all_symbols" is false)

Trading pair symbol

BTC

Copy
{
"code": 200,
"data": {
"cancelled_count": 10
},
"id": "b86b4f45-49da-4191-84e2-93e141acdeab",
"t": 1749221787291,
"type": "cancel_all_orders"
}
Field
Type
Description
'code'

integer

Status code

'data'

object

Contains information about placed order

'cancelled_count'

string

Number of orders successfully cancelled

'id'

string

Same as above request ID

't'

integer

Timestamp in milliseconds

'type'

string

Specifies action type

Get trade history
This endpoint allows users to get trade history

Copy
GET /api/v1/trades/history
Query Parameters
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"symbol"

string

optional

Market symbol to filter by

BTC

"start_time"

integer

optional

Start time in milliseconds

1625097600000

"end_time"

integer

optional

End time in milliseconds

1759215599188

"limit"

integer

optional

Maximum number of records to return, defaults to 100

100

"cursor"

integer

optional

Cursor pagination to access records. Default to none

1115hVka

Copy
/api/v1/positions/history?account=42trU9A5...&start_time=1625097600000&end_time=1759215599188
Response
Status 200: Successfully retrieved portfolio position history

Copy
{
"success": true,
"data": [
{
"history_id": 19329801,
"order_id": 315293920,
"client_order_id": "acf...",
"symbol": "LDO",
"amount": "0.1",
"price": "1.1904",
"entry_price": "1.176247",
"fee": "0",
"pnl": "-0.001415",
"event_type": "fulfill_maker",
"side": "close_short",
"created_at": 1759215599188,
"cause": "normal"
},
...
],
"next_cursor": "11111Z5RK",
"has_more": true
}
Field
Type
Description
"history_id"

integer

History id of trade

"order_id"

integer

Order id of order that resulted in the trade

"client_order_id"

UUID

CLOID of order that resulted in the trade

"symbol"

string

Trading pair symbol

"amount"

decimal string

Amount (in token denomination) of the trade event

"price"

decimal string

Current price of the specified symbol

"entry_price"

decimal string

Price at which the trade event was executed

"fee"

decimal string

Fee paid by the trade event

"pnl"

decimal string

PnL generated by the trade event

"event_type"

string

"fulfill_taker" if taker
"fulfill_maker" if maker

"side"

string

"open_long"
"open_short"
"close_long"
"close_short"

"created_at"

integer

Timestamp in milliseconds when the trade event occurred

"cause"

string

"normal"
regular user-initiated trading
"market_liquidation" position was liquidated due to insufficient margin
"backstop_liquidation" position was liquidated by backstop mechanism
"settlement"
position was closed due to Auto-Deleveraging (ADL) or other settlement

'next_cursor'

string

Next cursor for pagination

'has_more'

boolean

True if there exists a 'next_cursor'

Field
Type
Description
'event_type'

string

"fulfill_taker" if maker
"fulfill_maker" if taker

'side'

string

"open_long"
"open_short"
"close_long"
"close_short"

'cause'

string

"normal"
regular user-initiated trading
"market_liquidation" position was liquidated due to insufficient margin
"backstop_liquidation" position was liquidated by backstop mechanism
"settlement"
position was closed due to Auto-Deleveraging (ADL) or other settlement

Status 400: Invalid request parameters

Status 401: Unauthorized access

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"/api/v1/trades/history?account=42trU9A5...&symbol=BTC&limit=20&cursor=11115hVka",
headers={"Accept": "_/_"},
)

data = response.json()

Get historical funding
This endpoint retrieves the historical funding for a particular symbol

Copy
GET /api/v1/funding_rate/history
Query Parameters
Field
Type
Need
Description
Example
"symbol"

string

required

Market symbol to query

BTC

"limit"

integer

optional

Number of records to show (default 100, max 4000)

20

"cursor"

string

optional

Cursor pagination to access records. Default to none

1115hVka

Copy
/api/v1/funding_rate/history?symbol=BTC&limit=20&cursor=11115hVka
Response
Status 200: Successfully retrieved funding history

Copy
{
"success": true,
"data": [
{
"oracle_price": "117170.410304",
"bid_impact_price": "117126",
"ask_impact_price": "117142",
"funding_rate": "0.0000125",
"next_funding_rate": "0.0000125",
"created_at": 1753806934249
},
...
],
"next_cursor": "11114Lz77",
"has_more": true
}

Field
Type
Description
'oracle_price'

decimal string

Oracle price used for funding rate calculation

'bid_impact_price'

decimal string

Bid impact price at time of calculation (see funding rate docs)

'ask_impact_price'

decimal string

Ask impact price at time of calculation (see funding rate docs)

'funding_rate'

decimal string

Last settled funding rate

'next_funding_rate'

decimal string

Predicted funding rate for next settlement

'created_at'

integer

Timestamp in milliseconds

'next_cursor'

string

Next cursor for pagination

'has_more'

boolean

True if there exists a 'next_cursor'

Status 400: Invalid request parameters

Status 401: Unauthorized access

Status 500: Internal server error

Code Example (Python)

Copy
import requests

response = requests.get(
"/api/v1/funding*rate/history?symbol=BTC",
headers={"Accept": "*/\_"},
)

data = response.json()

Tick and lot size
The following doc describes how tick and lot size, as well as rounding, are handled at an API level when Pacifica's endpoints receives requests with price and amount fields.

Both 'price' and 'amount' fields in order related API operations are subject to rounding, needing to be multiples tick and lot size.

Generally tick_size is determined by the rightmost decimal place of a symbol's current price, and prices generally have five significant figures, with the exception of assets with more than six integer places, where sig.figs = #of integer places.

For example:

If 'price' = 123.45, expect 'tick_size' = 0.01
If 'price' = 123456, expect 'tick_size' = 1

Generally, lot_size\*tick_size = 0.0001 or 0.00001, based on the market.

For the exact implemented tick_size and lot_size of each market, call the market info endpoint to verify.

Rounding
Pacifica accepts requests containing 'price' and 'amount' fields only when they are multiples of tick_size and lot_size respectively. Any requests with incorrectly rounded 'price' and 'amount' fields will return '"Internal server error","code":500'

For example:

BTC has "tick_size": "1", "lot_size": "0.00001"

A request where "amount": "0.000005" will return Status 500: Internal server error
A request where "price": "100_000.5" will return Status 500: Internal server error

A request where "amount": "0.00002" will be accepted
A request where "price": "100_001" will be accepted

Market symbols
Symbols accepted by the Pacifica API are CASE SENSITIVE.

For example, 'BTC' is the expected form in requests, whereas requests with symbol field 'Btc' or'btc' will fail.

All markets symbols are capitalized, except for markets with abbreviated numerical prefixes such as 'kBONK' and 'kPEPE' , which have the prefix in lower-case. Requests containing symbol fields such as 'KBONK', 'kbonk', or 'kBonk' will fail.

Rate limits
Pacifica uses a credit-based rate limiting system with a 60-second rolling window.

Credit Quotas
The API config key system allows Pacifica to provision higher rate limits to verified users, ensuring real traders have adequate resources while protecting against abuse.

Tier
Base Credits/60s
Unidentified IP

125

Valid API Config Key

300

These are base quotas and may be increased based on account reputation.

Credit Costs
Action
Unidentified IP
API Config Key
Standard request/action

1

1

Order cancellation

0.5

0.5

Heavy GET requests

3–12

1–3

When credits are exhausted, requests return HTTP 429.

WebSocket Limits
Max 300 concurrent connections per IP

Max 20 subscriptions per channel per connection

Checking Your Quota
Note: All credit values are multiplied by 10 to support fractional costs (e.g., r=1200 = 120.0 credits).

REST API — Response headers:

Copy
ratelimit: "credits";r=1200;t=32
ratelimit-policy: "credits";q=1250;w=60
WebSocket — rl field in action responses:

Copy
{"rl": {"r": 1200, "q": 1250, "t": 32}}
Field
Description
r

Remaining credits

t

Seconds until refresh

q

Total quota per window

w

Window size in seconds

Signing
Pacifica uses deterministic JSON formatting to generate Ed25519 signatures for API authentication.

All POST requests require signing, whereas GET and websocket subscriptions do not.

We strongly recommend following the Pacifica Python SDK to generate signatures and submit trading requests. The following example explains the key steps in constructing valid signatures.

Implementation
The following guide provides a steps-by-step breakdown of Pacifica's signing implementation

1. Setup and Initialization:

Copy
import time
import base58
import requests
from solders.keypair import Keypair

PRIVATE_KEY = "your_private_key_here"

# Generate keypair from private key

keypair = Keypair.from_bytes(base58.b58decode(PRIVATE_KEY))
public_key = str(keypair.pubkey()) 2. Choose Endpoint and Define Operation Type
For this example, we use the order creation endpoint. Refer to Operation Types for a list of all types and corresponding API endpoints.

Copy
API_URL = "https://api.pacifica.fi/api/v1/orders/create"
operation_type = "create_order"
operation_data = {
"symbol": "BTC",
"price": "100000",
"amount": "0.1",
"side": "bid",
"tif": "GTC",
"reduce_only": False,
"client_order_id": str(uuid.uuid4()),
} 3. Create Signature Header
Note that all times specified are denoted in milliseconds.

The "expiry_window" field is optional, and defaults to 30_000 (30 seconds) if not specified in the header.

Copy

# Get current timestamp in milliseconds

timestamp = int(time.time() \* 1_000)

signature_header = {
"timestamp": timestamp,
"expiry_window": 5_000,  
 "type": "create_order",
} 4. Combine Header and Payload

Copy
data_to_sign = {
\*\*signature_header,
"data": operation_data,
}
In the case of our example, this creates:

Copy
{
"timestamp": 1748970123456,
"expiry_window": 5000,
"type": "create_order",
"data": {
"symbol": "BTC",
"price": "100000",
"amount": "0.1",
"side": "bid",
"tif": "GTC",
"reduce_only": False,
"client_order_id": "12345678-1234-1234-1234-123456789abc"
}
}
Note that data must be in same level as other headers.

5. Recursively Sort JSON Keys

Copy
def sort_json_keys(value):
if isinstance(value, dict):
sorted_dict = {}
for key in sorted(value.keys()):
sorted_dict[key] = sort_json_keys(value[key])
return sorted_dict
elif isinstance(value, list):
return [sort_json_keys(item) for item in value]
else:
return value

sorted_message = sort_json_keys(data_to_sign)
In the case of our example, this creates:

Copy
{
"data": {
"amount": "0.1",
"client*order_id": "12345678-1234-1234-1234-123456789abc",
"price": "100000",
"reduce_only": false,
"side": "bid",
"symbol": "BTC",
"tif": "GTC"
},
"expiry_window": 5000,
"timestamp": 1748970123456,
"type": "create_order"
}
Note that the recursive sorting alphabetically sorts \_all* levels

6. Create Compact JSON
   Compact JSON string with no whitespace and standardized seperators

Copy
import json

compact_json = json.dumps(sorted_message, separators=(",", ":"))
In the case of our example, this creates:

Copy
{"data":{"amount":"0.1","client*order_id":"12345678-1234-1234-1234-123456789abc","price":"100000","reduce_only":false,"side":"bid","symbol":"BTC","tif":"GTC"},"expiry_window":5000,"timestamp":1748970123456,"type":"create_order"}
This ensures that all logically identical messages will always produce \_identical* signatures

7. Convert to Bytes and Generate Signature
   Messages are converted to UTF-8 bytes for signing. The signature generated is then converted to Base58 string for transmission.

Copy

# Convert to UTF-8 bytes

message_bytes = compact_json.encode("utf-8")

# Sign message bytes using your private key

signature = keypair.sign_message(message_bytes)

# Convert signature to Base58 string

signature_b58 = base58.b58encode(bytes(signature)).decode("ascii")

# Expect an output similar to:

# "5j1Vy9UqYUF2jKD9r2Lv5AoMWHJuW5a1mqVzEhC9SJL5GqbPkGEQKpW3UZmKXr4UWrHMJ5xHQFMJkZWE8J5VyA"

8. Build Final Request
   Build the header with generated authentication info and combine with operation data (NOT the "data" wrapper!)

Copy
request_header = {
"account": public_key,
"agent_wallet": None,
"signature": signature_b58,
"timestamp": signature_header["timestamp"],
"expiry_window": signature_header["expiry_window"],
}

final_request = {
**request_header,
**operation_data, # Use the ORIGINAL create order fields
}
In the case of our example, the final request looks like:

Copy
{
"account": "6ETnufiec2CxVWTS4u5Wiq33Zh5Y3Qm6Pkdpi375fuxP",
"agent_wallet": null,
"signature": "5j1Vy9UqYUF2jKD9r2Lv5AoMWHJuW5a1mqVzEhC9SJL5GqbPkGEQKpW3UZmKXr4UWrHMJ",
"timestamp": 1748970123456,
"expiry_window": 5000,
"symbol": "BTC",
"price": "100000",
"amount": "0.1",
"side": "bid",
"tif": "GTC",
"reduce_only": false,
"client_order_id": "12345678-1234-1234-1234-123456789abc"
}

Operation Types
The following table provides a list of all "type"s required by the signature header and their corresponding API endpoints

Operation Type
API Endpoint
"create_order"

/api/v1/orders/create

"create_stop_order"

/api/v1/orders/stop/create

"cancel_order"

/api/v1/orders/cancel

"cancel_all_orders"

/api/v1/orders/cancel_all

"cancel_stop_order"

/api/v1/orders/stop/cancel

"update_leverage"

/api/v1/account/leverage

"update_margin_mode"

/api/v1/account/margin

"set_position_tpsl"

/api/v1/positions/tpsl

"withdraw"

/api/v1/account/withdraw

"subaccount_initiate"

/api/v1/account/subaccount/create

"subaccount_confirm"

/api/v1/account/subaccount/create

"create_market_order"

/api/v1/orders/create_market

"subaccount_transfer"

/api/v1/account/subaccount/transfer

"bind_agent_wallet"

/api/v1/agent/bind

"create_api_key"

/api/v1/account/api_keys/create

"revoke_api_key"

/api/v1/account/api_keys/revoke

"list_api_keys"

/api/v1/account/api_keys

Note: Pacifica's batch order endpoint does NOT have a corresponding operation type as all individual operations within the batch are signed independently with their own operation types.

Error Handling
An invalid signed message can result in a variety of Status 400 errors. The following illustrate error messages and common causes.

Error Message
Potential Causes
"Invalid signature"

Invalid signature format (not valid base58)

Signature bytes don't form a valid Ed25519 signature

Malformed signature data

"Invalid message"

Message has expired (timestamp + expiry_window < current time)

Message cannot be serialized to JSON

Message structure is malformed

"Invalid public key"

Account address doesn't represent a valid Ed25519 public key

Public key bytes are malformed

"Verification failed"

Signature doesn't match the message content

Wrong private key was used to sign

Message content was modified after signing

While we have provided several different error message types in order to aid debugging, an incorrectly generated signed message is still relatively ambiguous when it comes to troubleshooting the root cause of the issue, making debugging more challenging.

As such, the following guide and/or the Pacifica Python SDK, when followed closely, should make signing relatively straightforward to implement.

Hardware Wallet
Pacifica supports hardware wallet signature authentication via Ed25519 off-chain message signing. To use hardware wallet, after constructing the message bytes, prepend it with the \xffsolana offchain header together with message length, version information, etc.

Then, in the signature to send, use hardware as the type :

Copy
...
"signature": {
"type": "hardware",
"value": "2V4Y7Mpk...",
},
...
For more details, refer to this example in the Python SDK.

The signature verification process in both REST API and Websocket allow user generated API Agent Keys (also called "Agent Wallets") to sign on behalf of the original account. This is similar to the API Keys used for most leading exchanges. This way, API users can trade programmably without exposing the private key of the original wallet to the trading program.

Generate API Agent Keys
Agent wallets can be generated on the frontend, or using this Python SDK example.

Use API Agent Keys
For all POST requests, follow these steps in request construction

Still use the original wallet's public key for account,

Use API Agent Private Key to sign the message payload to generate signature, and

Add agent_wallet: [AGENT_WALLET_PUBLIC_KEY] to the request header.

As an example, this Python SDK program uses API Agent Key to place a market order.

API Documentation
API
Rate limits
API Config Keys
The following guide covers the creation and usage of Pacifica API Config Keys.

Pacifica offers API Config Key rate limiting on APIs that allows for more flexible limits.
For more information around API Config Key limits, please reach out to us in the Discord API channel.

API Config Keys are generated via REST API. The Python SDK provides examples for how API Config Key can be generated, listed and revoked: https://github.com/pacifica-fi/python-sdk/blob/main/rest/api_config_keys.py.

Each account can have up to 5 API Config Keys.

Copy
POST /api/v1/account/api_keys/create
POST /api/v1/account/api_keys/revoke
POST /api/v1/account/api_keys
Request Body:
Field
Type
Need
Description
Example
"account"

string

required

User's wallet address

42trU9A5...

"signature"

string

required

Cryptographic signature

5j1Vy9Uq...

"timestamp"

integer

required

Current timestamp in milliseconds

1716200000000

"expiry_window"

integer

optional

Signature expiry in milliseconds

30000

Response

Copy
{
"data": {
"api*key": "AbCdEfGh_2mT8x..."
}
}
Note:  
API Config Keys are generated with a prefix for fast lookup
Format: "{8_char_prefix}*{base58_encoded_uuid}"

Using a Pacifica API Config Key
Pacifica's API Config Keys are used to enhance websocket rate-limiting. The default rate for an API Config Key follows the same restrictions as IP-based rate limits.

Pacifica API Config Keys are used in the connection header to specify API Config Key rate limiting. Using the Python SDK as an example,

for Websockets, add extra_headers={"PF-API-KEY": "your_rate_limit_key"}into websockets.connect

for REST APIs, add "PF-API-KEY": "your_rate_limit_key" into headers with {"Content-Type": "application/json"}

API Documentation
Changelog
Changelog for Pacifica's API documentation

2026-01-01
Add li (last order id) to orderbook websocket stream [UPDATE]

2025-12-16
WebSocket

Initialization added to account_orders endpoint [UPDATE]

account_orders endpoint now sends snapshot of account's open orders upon subscription.

2025-12-06
REST API & WS

Last order ID added [NEW]

Added field in multiple REST and WS endpoints as an exchange-wide identifier to order all exchange events

2025-11-19
REST API

Market info endpoint updated [UPDATE]

Added created_at field to /api/v1/info response showing when each market was listed

WEBSOCKET

Account positions snapshot [UPDATE]

account_positions websocket endpoint now returns immediate snapshot of current positions upon subscription

Batch orders [NEW]

Order batching now supported via websocket

Best bid offer (BBO) [NEW]

bbo endpoint now supported via websocket

constantly streams top of book for selected symbol

REST API & WS

Edit order type added [NEW]

Added endpoint in REST and WS to edit price and/or size of existing orders

Mark price candle added [NEW]

Added endpoint in REST and WS to show mark price candles

Returns candle data based on mark price instead of traded prices

Batch order speed bump optimization [UPDATE]

Speed bump now applied conditionally based on order types in batch

Only applied if batch contains market orders or limit orders with TIF GTC/IOC

Speed bump not applied if batch only contains ALO/TOB orders, cancellations, or TP/SL updates

2025-11-12
GENERAL API

Taker latency increased. [UPDATE]

All market orders, TIF GTC, and TIF IOC orders are subject to a ~200ms delay

2025-11-10
REST API & WS

Top-of-Book (TOB) TIF order type added [NEW]

Useable in:

Frontend GUI under Limit, TIF, TOB (Post Only)

Create limit order REST API endpoint

Batch order REST API endpoint

Create limit order websocket endpoint

2025-11-09
GENERAL API

Taker latency added. [NEW]

All market orders, TIF GTC, and TIF IOC orders are subject to a randomized 50-100ms delay

2025-10-30
REST API

Cursor based pagination added for all history endpoints [UPDATE]

Offset pagination deprecated

2025-10-25
REST API

List subaccounts [NEW]

Added a new endpoint to retrieve subaccount information

WEBSOCKET

Orderbook websocket [UPDATE]

'book' websocket update interval improved from 500ms to 100ms
