use anchor_lang::prelude::*;
use crate::Side;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    /// Unique pool identifier
    pub pool_id: [u8; 32],
    /// Asset symbol (e.g., "BTC", "ETH")
    #[max_len(16)]
    pub asset: String,
    /// Authority that can resolve the pool
    pub authority: Pubkey,
    /// USDC mint address
    pub usdc_mint: Pubkey,
    /// Vault PDA for holding USDC
    pub vault: Pubkey,
    /// Pool start time (when betting locks)
    pub start_time: i64,
    /// Pool end time (when resolution happens)
    pub end_time: i64,
    /// Lock time (deadline for deposits)
    pub lock_time: i64,
    /// Strike price (captured at start_time)
    pub strike_price: u64,
    /// Final price (captured at end_time)
    pub final_price: u64,
    /// Total USDC deposited on UP side
    pub total_up: u64,
    /// Total USDC deposited on DOWN side
    pub total_down: u64,
    /// Pool status
    pub status: PoolStatus,
    /// Winning side (set after resolution)
    pub winner: Option<Side>,
    /// Bump seed for PDA
    pub bump: u8,
    /// Vault bump seed
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PoolStatus {
    /// Pool created, waiting for join window
    Upcoming,
    /// Users can deposit
    Joining,
    /// Deposits locked, waiting for resolution
    Active,
    /// Winner determined, claims enabled
    Resolved,
}

#[account]
#[derive(InitSpace)]
pub struct UserBet {
    /// Pool this bet belongs to
    pub pool: Pubkey,
    /// User who placed the bet
    pub user: Pubkey,
    /// Side chosen (UP or DOWN)
    pub side: Side,
    /// Amount deposited
    pub amount: u64,
    /// Whether payout has been claimed
    pub claimed: bool,
    /// Bump seed for PDA
    pub bump: u8,
}

impl Pool {
    pub const SEED_PREFIX: &'static [u8] = b"pool";
    pub const VAULT_SEED_PREFIX: &'static [u8] = b"vault";
}

impl UserBet {
    pub const SEED_PREFIX: &'static [u8] = b"bet";
}
