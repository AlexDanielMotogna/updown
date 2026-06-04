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
    /// Total USDC deposited on side 2 (DRAW - sports only, always 0 for crypto)
    pub total_draw: u64,
    /// Time-weighted sum on side 0 (UP). Each deposit adds amount × M(t)
    /// where M(t) = max(WEIGHT_FLOOR_BPS / 10000, (lock - now) / window).
    /// Used as the denominator in the claim payout share so early bettors
    /// keep a larger slice of the losing pool. See PLAN-TIME-WEIGHTED-
    /// PAYOUTS.md for the derivation.
    pub weighted_up: u64,
    /// Time-weighted sum on side 1 (DOWN).
    pub weighted_down: u64,
    /// Time-weighted sum on side 2 (DRAW, 0 for 2-way pools).
    pub weighted_draw: u64,
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
    /// Time-weighted contribution = amount × M(t) at deposit time.
    /// Multiple deposits on the same side accumulate weights at their
    /// individual moments — early USDC gets credited with a fatter
    /// multiplier than top-ups added near the lock.
    pub weight: u64,
    /// unix_timestamp (seconds) of the FIRST deposit on this account.
    /// Pure analytics / verification field — payout uses `weight`, not
    /// this. Kept so the operator can audit suspicious patterns and so
    /// future migrations have a single canonical entry time per bet.
    pub entry_time: i64,
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

    /// Time-weighted sum on the given side. Mirrors `total_for_side` for
    /// the new weighted claim formula.
    pub fn weighted_for_side(&self, side: Side) -> u64 {
        match side {
            Side::Up => self.weighted_up,
            Side::Down => self.weighted_down,
            Side::Draw => self.weighted_draw,
        }
    }

    /// Compute the current time-weight multiplier in basis points
    /// (10_000 == 1.0). Linear decay with a floor:
    ///
    ///   ratio_bps = (lock_time − now) × 10_000 / window
    ///   multiplier_bps = max(WEIGHT_FLOOR_BPS, ratio_bps)
    ///
    /// Linear (not 1.5-power like the off-chain advisory) because BPF
    /// can't do floating-point and a fractional exponent isn't worth a
    /// lookup table — the FLOOR does most of the late-bettor punishment
    /// anyway. Floor is 0.10 by default so a snipe at t-1s still earns
    /// 10 % of full credit; high enough to avoid "win the bet, lose
    /// money" but low enough to make sniping economically unattractive.
    ///
    /// Returns WEIGHT_FLOOR_BPS for any pool with a degenerate window
    /// (start_time >= lock_time) so resolving such a pool falls back to
    /// flat-rate payouts rather than crashing.
    pub fn multiplier_bps(&self, now_ts: i64) -> u64 {
        let window = self.lock_time.saturating_sub(self.start_time);
        if window <= 0 {
            return WEIGHT_FLOOR_BPS;
        }
        let now_clamped = now_ts.max(self.start_time).min(self.lock_time);
        let remaining = (self.lock_time - now_clamped) as u64;
        let raw_bps = remaining
            .checked_mul(10_000)
            .unwrap_or(WEIGHT_FLOOR_BPS)
            .checked_div(window as u64)
            .unwrap_or(WEIGHT_FLOOR_BPS);
        raw_bps.max(WEIGHT_FLOOR_BPS)
    }
}

/// Floor on the time-weight multiplier (basis points). 1000 == 0.10.
/// A bet placed at the very last second of the deposit window still
/// earns this share of full credit — enough that picking the winning
/// side returns the principal plus a small positive bonus.
pub const WEIGHT_FLOOR_BPS: u64 = 1_000;

impl UserBet {
    pub const SEED_PREFIX: &'static [u8] = b"bet";
}

// ── Tournament State ────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TournamentStatus {
    Registering,
    Active,
    Completed,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Tournament {
    /// 32-byte ID (SHA-256 of DB UUID)
    pub tournament_id: [u8; 32],
    /// Authority that can resolve/cancel
    pub authority: Pubkey,
    /// USDC mint address
    pub usdc_mint: Pubkey,
    /// Vault PDA for holding USDC entry fees
    pub vault: Pubkey,
    /// Entry fee per participant (USDC lamports)
    pub entry_fee: u64,
    /// Maximum number of participants
    pub max_participants: u16,
    /// Current number of registered participants
    pub participant_count: u16,
    /// Accumulated prize pool (should match vault balance)
    pub prize_pool: u64,
    /// Tournament status
    pub status: TournamentStatus,
    /// Winner pubkey (set when status = Completed)
    pub winner: Option<Pubkey>,
    /// Bump for Tournament PDA
    pub bump: u8,
    /// Bump for Vault PDA
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TournamentParticipant {
    /// Tournament this participant belongs to
    pub tournament: Pubkey,
    /// User's wallet pubkey
    pub user: Pubkey,
    /// Whether entry fee has been refunded
    pub refunded: bool,
    /// Whether prize has been claimed
    pub claimed: bool,
    /// Bump seed
    pub bump: u8,
}

impl Tournament {
    pub const SEED_PREFIX: &'static [u8] = b"tournament";
    pub const VAULT_SEED_PREFIX: &'static [u8] = b"tournament_vault";
}

impl TournamentParticipant {
    pub const SEED_PREFIX: &'static [u8] = b"participant";
}
