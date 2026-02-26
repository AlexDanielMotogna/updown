/// Maximum length for pool ID string
pub const MAX_POOL_ID_LEN: usize = 32;

/// Maximum length for asset symbol
pub const MAX_ASSET_LEN: usize = 10;

/// Maximum length for interval string
pub const MAX_INTERVAL_LEN: usize = 10;

/// USDC has 6 decimals
pub const USDC_DECIMALS: u8 = 6;

/// Price precision (8 decimals)
pub const PRICE_DECIMALS: u8 = 8;

/// Minimum deposit amount (1 USDC = 1_000_000 lamports)
pub const MIN_DEPOSIT: u64 = 1_000_000;

/// Seed prefixes for PDAs
pub const POOL_SEED: &[u8] = b"pool";
pub const VAULT_SEED: &[u8] = b"vault";
pub const BET_SEED: &[u8] = b"bet";
