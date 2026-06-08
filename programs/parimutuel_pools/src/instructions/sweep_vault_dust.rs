use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::PoolError;
use crate::state::{Pool, PoolStatus};

/// Max leftover vault balance treated as rounding "dust". Time-weighted payouts
/// round down via integer division, leaving a few micro-USDC in the vault, so it
/// never reaches 0 and `close_pool` (which requires vault.amount == 0) can never
/// close it — locking the pool + vault rent forever. 1000 = 0.001 USDC, far
/// below any real unpaid winnings (a real bet is >= 1 USDC = 1_000_000).
const DUST_THRESHOLD: u64 = 1000;

/// Authority-signed sweep of leftover rounding dust from a resolved pool's vault
/// to the authority, so the vault balance hits 0 and the pool can be closed.
/// Refuses to run if the vault holds more than dust (real funds must be paid to
/// winners / refunded, never swept).
#[derive(Accounts)]
pub struct SweepVaultDust<'info> {
    #[account(
        constraint = pool.status == PoolStatus::Resolved @ PoolError::InvalidPoolStatus
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [Pool::VAULT_SEED_PREFIX, pool.pool_id.as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = authority_token_account.mint == pool.usdc_mint,
        constraint = authority_token_account.owner == authority.key()
    )]
    pub authority_token_account: Account<'info, TokenAccount>,

    #[account(
        constraint = authority.key() == pool.authority @ PoolError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SweepVaultDust>) -> Result<()> {
    let amount = ctx.accounts.vault.amount;
    require!(amount > 0, PoolError::VaultNotEmpty);
    require!(amount <= DUST_THRESHOLD, PoolError::VaultNotEmpty);

    let pool_id = ctx.accounts.pool.pool_id;
    let bump = ctx.accounts.pool.bump;
    let seeds = &[Pool::SEED_PREFIX, pool_id.as_ref(), &[bump]];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.authority_token_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    Ok(())
}
