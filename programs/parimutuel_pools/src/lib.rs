use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("HnqB6ahdTEGwJ624D6kaeoSxUS2YwNoq1Cn5Kt9KQBTD");

#[program]
pub mod parimutuel_pools {
    use super::*;

    /// Initialize a new pool (2-way for crypto, 3-way for sports)
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        pool_id: [u8; 32],
        asset: String,
        start_time: i64,
        end_time: i64,
        lock_time: i64,
        strike_price: u64,
        num_sides: u8,
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, pool_id, asset, start_time, end_time, lock_time, strike_price, num_sides)
    }

    /// Deposit USDC to a pool (side 0=UP/HOME, 1=DOWN/AWAY, 2=DRAW)
    pub fn deposit(ctx: Context<Deposit>, side: Side, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, side, amount)
    }

    /// Resolve pool - for crypto: by price, for sports: by winner index
    pub fn resolve(
        ctx: Context<Resolve>,
        strike_price: u64,
        final_price: u64,
    ) -> Result<()> {
        instructions::resolve::handler(ctx, strike_price, final_price)
    }

    /// Resolve pool with explicit winner (for sports pools)
    pub fn resolve_with_winner(
        ctx: Context<Resolve>,
        winner: Side,
    ) -> Result<()> {
        instructions::resolve::handler_with_winner(ctx, winner)
    }

    /// Claim payout from resolved pool (user + authority co-sign, with fee).
    /// `side` selects which per-side UserBet account to claim (the winning side).
    pub fn claim(ctx: Context<Claim>, fee_bps: u16, side: Side) -> Result<()> {
        instructions::claim::handler(ctx, fee_bps, side)
    }

    /// Refund a user's bet on a given `side` (authority-only, no user signature needed)
    pub fn refund(ctx: Context<Refund>, side: Side) -> Result<()> {
        instructions::refund::handler(ctx, side)
    }

    /// Void-refund a bettor their own stake regardless of side (authority only),
    /// for a cancelled / postponed / abandoned match. Fair for multi-side pools.
    pub fn refund_bettor(ctx: Context<RefundBettor>, side: Side) -> Result<()> {
        instructions::refund_bettor::handler(ctx, side)
    }

    /// Close a LOSING bet's account, returning its rent to the bettor (authority
    /// only). Losers forfeit only their USDC stake, not the SOL rent.
    pub fn close_losing_bet(ctx: Context<CloseLosingBet>, side: Side) -> Result<()> {
        instructions::close_losing_bet::handler(ctx, side)
    }

    /// Sweep rounding dust from a resolved pool's vault to the authority so the
    /// pool can be closed (authority only).
    pub fn sweep_vault_dust(ctx: Context<SweepVaultDust>) -> Result<()> {
        instructions::sweep_vault_dust::handler(ctx)
    }

    /// Close a resolved pool and reclaim rent (authority only)
    pub fn close_pool(ctx: Context<ClosePool>) -> Result<()> {
        instructions::close_pool::handler(ctx)
    }

    /// Force-close a resolved pool bypassing vault seeds check (orphan recovery)
    pub fn force_close_pool(ctx: Context<ForceClosePool>) -> Result<()> {
        instructions::force_close_pool::handler(ctx)
    }

    // ── Tournament instructions ──

    /// Initialize a tournament with vault for entry fees
    pub fn initialize_tournament(
        ctx: Context<InitializeTournament>,
        tournament_id: [u8; 32],
        entry_fee: u64,
        max_participants: u16,
    ) -> Result<()> {
        instructions::initialize_tournament::handler(ctx, tournament_id, entry_fee, max_participants)
    }

    /// Register as tournament participant (deposits entry fee to vault)
    pub fn register_participant(ctx: Context<RegisterParticipant>) -> Result<()> {
        instructions::register_participant::handler(ctx)
    }

    /// Winner claims prize from tournament vault (5% fee on-chain)
    pub fn claim_tournament_prize(ctx: Context<ClaimTournamentPrize>) -> Result<()> {
        instructions::claim_tournament_prize::handler(ctx)
    }

    /// Cancel tournament (authority only, enables refunds)
    pub fn cancel_tournament(ctx: Context<CancelTournament>) -> Result<()> {
        instructions::cancel_tournament::handler(ctx)
    }

    /// Refund participant entry fee (cancelled tournaments, authority-signed)
    pub fn refund_participant(ctx: Context<RefundParticipant>) -> Result<()> {
        instructions::refund_participant::handler(ctx)
    }

    /// Close tournament + vault, reclaim rent
    pub fn close_tournament(ctx: Context<CloseTournament>) -> Result<()> {
        instructions::close_tournament::handler(ctx)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Side {
    Up,
    Down,
    Draw,
}
