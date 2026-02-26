use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::PoolError;
use crate::events::PayoutClaimed;
use crate::state::{Pool, PoolStatus, UserBet};
use crate::Side;

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(
        constraint = pool.status == PoolStatus::Resolved @ PoolError::NotResolved
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [UserBet::SEED_PREFIX, pool.key().as_ref(), user.key().as_ref()],
        bump = user_bet.bump,
        constraint = user_bet.user == user.key(),
        constraint = !user_bet.claimed @ PoolError::AlreadyClaimed
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
}

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let user_bet = &mut ctx.accounts.user_bet;

    // Check user is on winning side
    let winner = pool.winner.ok_or(PoolError::NotResolved)?;
    require!(user_bet.side == winner, PoolError::NotWinner);

    // Calculate payout
    // Formula: user_payout = (user_bet / total_winning_side) * total_pool
    let total_pool = pool.total_up.checked_add(pool.total_down).ok_or(PoolError::Overflow)?;
    let total_winning_side = match winner {
        Side::Up => pool.total_up,
        Side::Down => pool.total_down,
    };

    require!(total_winning_side > 0, PoolError::NoWinningBets);

    // Use u128 for intermediate calculation to prevent overflow
    let payout = (user_bet.amount as u128)
        .checked_mul(total_pool as u128)
        .ok_or(PoolError::Overflow)?
        .checked_div(total_winning_side as u128)
        .ok_or(PoolError::Overflow)? as u64;

    // Transfer payout from vault to user
    let pool_id = pool.pool_id;
    let seeds = &[
        Pool::SEED_PREFIX,
        pool_id.as_ref(),
        &[pool.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, payout)?;

    // Mark as claimed
    user_bet.claimed = true;

    emit!(PayoutClaimed {
        pool_id: pool.pool_id,
        user: ctx.accounts.user.key(),
        amount: payout,
        side: user_bet.side,
    });

    Ok(())
}
