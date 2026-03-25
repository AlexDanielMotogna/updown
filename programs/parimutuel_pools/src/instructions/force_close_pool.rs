use anchor_lang::prelude::*;

use crate::errors::PoolError;
use crate::events::PoolClosed;
use crate::state::{Pool, PoolStatus};

/// Force-close a resolved pool account, reclaiming rent to authority.
/// Does NOT close the vault (old pools have corrupted bump from struct layout changes).
/// The vault token accounts (0 balance, ~0.002 SOL rent each) are left on-chain.
#[derive(Accounts)]
pub struct ForceClosePool<'info> {
    #[account(
        mut,
        close = authority,
        has_one = authority,
        constraint = pool.status == PoolStatus::Resolved @ PoolError::InvalidPoolStatus
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<ForceClosePool>) -> Result<()> {
    let pool = &ctx.accounts.pool;

    emit!(PoolClosed {
        pool_id: pool.pool_id,
        authority: ctx.accounts.authority.key(),
        rent_reclaimed: ctx.accounts.pool.to_account_info().lamports(),
    });

    // Pool account closed by Anchor's `close = authority`
    Ok(())
}
