use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::PoolError;
use crate::events::Refunded;
use crate::state::{Pool, UserBet};
use crate::Side;

/// Authority-signed VOID refund: returns a bettor their OWN stake
/// (`user_bet.amount`) regardless of side, for a pool being cancelled/voided
/// (match cancelled, postponed, abandoned). Unlike `refund` — which is a
/// winner-take-all payout and can only refund the winning side — this returns
/// exactly the principal to every bettor, so a multi-side pool can be refunded
/// fairly. Closes the `user_bet` (its rent goes back to the bettor too).
///
/// Refuses once a winner is set (`pool.winner.is_none()`), so it can never be
/// abused to pay a loser on an already-resolved pool. Refund every bet first,
/// then resolve+close the now-empty pool to reclaim its rent.
#[derive(Accounts)]
#[instruction(side: Side)]
pub struct RefundBettor<'info> {
    #[account(
        constraint = pool.winner.is_none() @ PoolError::AlreadyResolved
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        close = user,
        seeds = [UserBet::SEED_PREFIX, pool.key().as_ref(), user.key().as_ref(), &[side as u8]],
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

    /// CHECK: Bettor account - not a signer. Receives the refunded stake (USDC)
    /// and the reclaimed rent via `close = user`.
    #[account(mut)]
    pub user: AccountInfo<'info>,

    #[account(
        constraint = authority.key() == pool.authority @ PoolError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<RefundBettor>, _side: Side) -> Result<()> {
    let amount = ctx.accounts.user_bet.amount;

    let pool_id = ctx.accounts.pool.pool_id;
    let bump = ctx.accounts.pool.bump;
    let seeds = &[Pool::SEED_PREFIX, pool_id.as_ref(), &[bump]];
    let signer_seeds = &[&seeds[..]];

    // Return exactly the principal — no winnings, no fee.
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let user_bet = &mut ctx.accounts.user_bet;
    user_bet.claimed = true;

    emit!(Refunded {
        pool_id,
        user: ctx.accounts.user.key(),
        amount,
        side: user_bet.side,
    });

    Ok(())
}
