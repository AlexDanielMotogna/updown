use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::PoolError;
use crate::events::PayoutClaimed;
use crate::state::{Pool, PoolStatus, UserBet};

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(
        constraint = pool.status == PoolStatus::Resolved @ PoolError::NotResolved
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        close = user,
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

    /// Authority co-signs to enforce fee_bps — prevents users from passing fee_bps=0
    #[account(
        constraint = authority.key() == pool.authority @ PoolError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// Fee wallet receives platform fees
    #[account(
        mut,
        constraint = fee_wallet.mint == pool.usdc_mint
    )]
    pub fee_wallet: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Claim>, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= 10000, PoolError::InvalidFeeBps);

    let pool = &ctx.accounts.pool;
    let user_bet = &mut ctx.accounts.user_bet;

    // Check user is on winning side
    let winner = pool.winner.ok_or(PoolError::NotResolved)?;
    require!(user_bet.side == winner, PoolError::NotWinner);

    // Calculate gross payout using helper methods
    let total_pool = pool.total_pool()?;
    let total_winning_side = pool.total_for_side(winner);

    require!(total_winning_side > 0, PoolError::NoWinningBets);

    let gross_payout = (user_bet.amount as u128)
        .checked_mul(total_pool as u128)
        .ok_or(PoolError::Overflow)?
        .checked_div(total_winning_side as u128)
        .ok_or(PoolError::Overflow)? as u64;

    // Calculate fee
    let fee = (gross_payout as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(PoolError::Overflow)?
        .checked_div(10000u128)
        .ok_or(PoolError::Overflow)? as u64;

    let net_payout = gross_payout.checked_sub(fee).ok_or(PoolError::Overflow)?;

    // PDA signer seeds
    let pool_id = pool.pool_id;
    let seeds = &[
        Pool::SEED_PREFIX,
        pool_id.as_ref(),
        &[pool.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Transfer net payout to user
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, net_payout)?;

    // Transfer fee to fee wallet (if any)
    if fee > 0 {
        let fee_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.fee_wallet.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };
        let fee_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            fee_accounts,
            signer_seeds,
        );
        token::transfer(fee_ctx, fee)?;
    }

    // Mark as claimed
    user_bet.claimed = true;

    emit!(PayoutClaimed {
        pool_id: pool.pool_id,
        user: ctx.accounts.user.key(),
        amount: net_payout,
        fee,
        side: user_bet.side,
    });

    Ok(())
}
