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

    /// Initialize a new pool
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        pool_id: [u8; 32],
        asset: String,
        start_time: i64,
        end_time: i64,
        lock_time: i64,
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, pool_id, asset, start_time, end_time, lock_time)
    }

    /// Deposit USDC to a pool (UP or DOWN side)
    pub fn deposit(ctx: Context<Deposit>, side: Side, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, side, amount)
    }

    /// Resolve pool with final price (authority only)
    pub fn resolve(
        ctx: Context<Resolve>,
        strike_price: u64,
        final_price: u64,
    ) -> Result<()> {
        instructions::resolve::handler(ctx, strike_price, final_price)
    }

    /// Claim payout from resolved pool
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Side {
    Up,
    Down,
}
