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
        constraint = pool.status != PoolStatus::Resolved @ PoolError::InvalidPoolStatus
    )]
    pub pool: Account<'info, Pool>,

    pub authority: Signer<'info>,
}

/// Resolve by price comparison (crypto pools, num_sides=2)
pub fn handler(
    ctx: Context<Resolve>,
    strike_price: u64,
    final_price: u64,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // NOTE: The previous `require!(clock >= pool.end_time)` check was removed.
    // Authority signature + status != Resolved (enforced on the account
    // constraints above) are the actual safety net — the scheduler is the
    // sole writer of `strike_price` / `final_price` and only resolves when
    // it has a confirmed result. The old check forced us to wait hours past
    // the real match end before the chain accepted resolution, even though
    // the scheduler already had the verified score.

    // Store prices
    pool.strike_price = strike_price;
    pool.final_price = final_price;

    // Determine winner by price
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
        total_draw: pool.total_draw,
    });

    Ok(())
}

/// Resolve with explicit winner (sports pools, num_sides=2 or 3)
pub fn handler_with_winner(
    ctx: Context<Resolve>,
    winner: Side,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // NOTE: see handler() above for why the `clock >= pool.end_time` check
    // was removed. For sports, livescore feeds (The Odds API primary,
    // TheSportsDB fallback) confirm FT well before the pool's 4-hour
    // end_time, and the scheduler now fires resolution as soon as a
    // confirmed score lands instead of waiting on the chain timestamp.

    // Validate winner side is valid for this pool
    if winner == Side::Draw {
        require!(pool.num_sides == 3, PoolError::InvalidSide);
    }

    pool.winner = Some(winner);
    pool.status = PoolStatus::Resolved;

    emit!(PoolResolved {
        pool_id: pool.pool_id,
        strike_price: pool.strike_price,
        final_price: pool.final_price,
        winner,
        total_up: pool.total_up,
        total_down: pool.total_down,
        total_draw: pool.total_draw,
    });

    Ok(())
}
