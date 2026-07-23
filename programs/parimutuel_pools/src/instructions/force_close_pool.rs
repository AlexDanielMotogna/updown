use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::errors::PoolError;
use crate::events::PoolClosed;
use crate::state::{Pool, PoolStatus};

/// Force-close a resolved pool account, reclaiming rent to authority.
/// Does NOT close the vault (old pools have corrupted bump from struct layout changes).
/// The vault token accounts (0 balance, ~0.002 SOL rent each) are left on-chain.
///
/// SAFETY: the vault must already be EMPTY (all claims/refunds processed) so this
/// escape hatch can never strand user funds — we read the balance by pubkey
/// (`pool.vault`), which works even when the vault PDA bump is corrupted and
/// `close_pool` can't derive/close it.
#[derive(Accounts)]
pub struct ForceClosePool<'info> {
    #[account(
        mut,
        close = authority,
        has_one = authority,
        constraint = pool.status == PoolStatus::Resolved @ PoolError::InvalidPoolStatus
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        constraint = vault.key() == pool.vault,
        constraint = vault.amount == 0 @ PoolError::VaultNotEmpty
    )]
    pub vault: Account<'info, TokenAccount>,

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
