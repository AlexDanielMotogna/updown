use anchor_lang::prelude::*;

use crate::errors::PoolError;
use crate::events::PoolResolved;
use crate::state::{Pool, PoolStatus};
use crate::Side;

#[derive(Accounts)]
pub struct Resolve<'info> {
    #[account(
        mut,
        constraint = pool.authority == authority.key() @ PoolError::Unauthorized,
        constraint = pool.status == PoolStatus::Joining || pool.status == PoolStatus::Active @ PoolError::InvalidPoolStatus
    )]
    pub pool: Account<'info, Pool>,

    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<Resolve>,
    strike_price: u64,
    final_price: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let pool = &mut ctx.accounts.pool;

    // Check that pool has ended
    require!(
        clock.unix_timestamp >= pool.end_time,
        PoolError::PoolNotEnded
    );

    // Store prices
    pool.strike_price = strike_price;
    pool.final_price = final_price;

    // Determine winner
    let winner = if final_price > strike_price {
        Side::Up
    } else {
        Side::Down
    };

    pool.winner = Some(winner);
    pool.status = PoolStatus::Resolved;

    emit!(PoolResolved {
        pool_id: pool.pool_id,
        strike_price,
        final_price,
        winner,
        total_up: pool.total_up,
        total_down: pool.total_down,
    });

    Ok(())
}
