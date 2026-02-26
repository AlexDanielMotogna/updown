use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::PoolError;
use crate::events::Deposited;
use crate::state::{Pool, PoolStatus, UserBet};
use crate::Side;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        constraint = pool.status == PoolStatus::Joining @ PoolError::NotJoining
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = user,
        space = 8 + UserBet::INIT_SPACE,
        seeds = [UserBet::SEED_PREFIX, pool.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_bet: Account<'info, UserBet>,

    #[account(
        mut,
        constraint = vault.key() == pool.vault
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == pool.usdc_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Deposit>, side: Side, amount: u64) -> Result<()> {
    require!(amount > 0, PoolError::ZeroDeposit);

    let clock = Clock::get()?;
    let pool = &mut ctx.accounts.pool;

    // Check deposit deadline
    require!(
        clock.unix_timestamp < pool.lock_time,
        PoolError::DepositDeadlinePassed
    );

    // Transfer USDC from user to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Update pool totals
    match side {
        Side::Up => {
            pool.total_up = pool.total_up.checked_add(amount).ok_or(PoolError::Overflow)?;
        }
        Side::Down => {
            pool.total_down = pool.total_down.checked_add(amount).ok_or(PoolError::Overflow)?;
        }
    }

    // Initialize user bet
    let user_bet = &mut ctx.accounts.user_bet;
    user_bet.pool = pool.key();
    user_bet.user = ctx.accounts.user.key();
    user_bet.side = side;
    user_bet.amount = amount;
    user_bet.claimed = false;
    user_bet.bump = ctx.bumps.user_bet;

    emit!(Deposited {
        pool_id: pool.pool_id,
        user: ctx.accounts.user.key(),
        side,
        amount,
        total_up: pool.total_up,
        total_down: pool.total_down,
    });

    Ok(())
}
