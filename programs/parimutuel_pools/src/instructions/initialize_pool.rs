use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::PoolError;
use crate::events::PoolCreated;
use crate::state::{Pool, PoolStatus};

#[derive(Accounts)]
#[instruction(pool_id: [u8; 32])]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [Pool::SEED_PREFIX, pool_id.as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = authority,
        seeds = [Pool::VAULT_SEED_PREFIX, pool_id.as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializePool>,
    pool_id: [u8; 32],
    asset: String,
    start_time: i64,
    end_time: i64,
    lock_time: i64,
) -> Result<()> {
    // Validate time configuration
    require!(
        lock_time < start_time && start_time < end_time,
        PoolError::InvalidTimeConfig
    );

    let pool = &mut ctx.accounts.pool;

    pool.pool_id = pool_id;
    pool.asset = asset.clone();
    pool.authority = ctx.accounts.authority.key();
    pool.usdc_mint = ctx.accounts.usdc_mint.key();
    pool.vault = ctx.accounts.vault.key();
    pool.start_time = start_time;
    pool.end_time = end_time;
    pool.lock_time = lock_time;
    pool.strike_price = 0;
    pool.final_price = 0;
    pool.total_up = 0;
    pool.total_down = 0;
    pool.status = PoolStatus::Joining;
    pool.winner = None;
    pool.bump = ctx.bumps.pool;
    pool.vault_bump = ctx.bumps.vault;

    emit!(PoolCreated {
        pool_id,
        asset,
        authority: ctx.accounts.authority.key(),
        start_time,
        end_time,
        lock_time,
    });

    Ok(())
}
