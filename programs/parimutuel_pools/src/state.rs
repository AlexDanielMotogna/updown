use anchor_lang::prelude::*;
use crate::Side;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    /// Unique pool identifier
    pub pool_id: [u8; 32],
    /// Asset symbol (e.g., "BTC", "ETH") or match ID (e.g., "UCL:RMA-BAR")
    #[max_len(32)]
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
    /// Strike price (crypto pools only, 0 for sports)
    pub strike_price: u64,
    /// Final price (crypto pools only, 0 for sports)
    pub final_price: u64,
    /// Total USDC deposited on side 0 (UP / HOME)
    pub total_up: u64,
    /// Total USDC deposited on side 1 (DOWN / AWAY)
    pub total_down: u64,
    /// Total USDC deposited on side 2 (DRAW — sports only, always 0 for crypto)
    pub total_draw: u64,
    /// Number of sides: 2 for crypto, 3 for sports
    pub num_sides: u8,
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
    /// Side chosen (Up=0, Down=1, Draw=2)
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

    /// Get total pool across all sides
    pub fn total_pool(&self) -> Result<u64> {
        self.total_up
            .checked_add(self.total_down)
            .and_then(|t| t.checked_add(self.total_draw))
            .ok_or_else(|| error!(crate::errors::PoolError::Overflow))
    }

    /// Get total deposited on the winning side
    pub fn total_for_side(&self, side: Side) -> u64 {
        match side {
            Side::Up => self.total_up,
            Side::Down => self.total_down,
            Side::Draw => self.total_draw,
        }
    }
}

impl UserBet {
    pub const SEED_PREFIX: &'static [u8] = b"bet";
}
