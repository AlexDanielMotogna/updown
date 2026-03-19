use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, CloseAccount};

use crate::errors::PoolError;
use crate::events::PoolClosed;
use crate::state::{Pool, PoolStatus};

#[derive(Accounts)]
pub struct ClosePool<'info> {
    #[account(
        mut,
        close = authority,
        has_one = authority,
        constraint = pool.status == PoolStatus::Resolved @ PoolError::InvalidPoolStatus
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [Pool::VAULT_SEED_PREFIX, pool.pool_id.as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClosePool>) -> Result<()> {
    let pool = &ctx.accounts.pool;

    // Vault must be empty (all claims/refunds processed)
    require!(ctx.accounts.vault.amount == 0, PoolError::VaultNotEmpty);

    let rent_reclaimed = ctx.accounts.vault.to_account_info().lamports()
        + ctx.accounts.pool.to_account_info().lamports();

    // Close vault token account — pool PDA signs as vault authority
    let pool_id = pool.pool_id;
    let seeds = &[
        Pool::SEED_PREFIX,
        pool_id.as_ref(),
        &[pool.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        },
        signer_seeds,
    ))?;

    // Pool account is closed by Anchor's `close = authority` constraint

    emit!(PoolClosed {
        pool_id: pool.pool_id,
        authority: ctx.accounts.authority.key(),
        rent_reclaimed,
    });

    Ok(())
}
