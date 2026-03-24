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

    /// Resolve pool — for crypto: by price, for sports: by winner index
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

    /// Claim payout from resolved pool (user + authority co-sign, with fee)
    pub fn claim(ctx: Context<Claim>, fee_bps: u16) -> Result<()> {
        instructions::claim::handler(ctx, fee_bps)
    }

    /// Refund a user's bet (authority-only, no user signature needed)
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handler(ctx)
    }

    /// Close a resolved pool and reclaim rent (authority only)
    pub fn close_pool(ctx: Context<ClosePool>) -> Result<()> {
        instructions::close_pool::handler(ctx)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Side {
    Up,
    Down,
    Draw,
}
