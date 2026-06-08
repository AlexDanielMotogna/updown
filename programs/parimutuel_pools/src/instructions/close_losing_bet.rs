use anchor_lang::prelude::*;

use crate::errors::PoolError;
use crate::state::{Pool, PoolStatus, UserBet};
use crate::Side;

/// Authority-signed close of a LOSING bet's account, returning the account rent
/// (~0.0009 SOL) to the bettor. A loser forfeits only their USDC stake (which
/// stays in the vault for the winners) — not the SOL rent they paid to open the
/// position. Without this the losing `user_bet` PDA would stay open forever and
/// its rent would be locked permanently. No USDC is transferred here; winners
/// use `claim` instead. Closes one (pool, user, side) position at a time.
#[derive(Accounts)]
#[instruction(side: Side)]
pub struct CloseLosingBet<'info> {
    #[account(
        constraint = pool.status == PoolStatus::Resolved @ PoolError::NotResolved
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

    /// CHECK: Bettor account - not a signer. Receives the reclaimed rent via
    /// `close = user` and is used for PDA derivation / ownership checks.
    #[account(mut)]
    pub user: AccountInfo<'info>,

    #[account(
        constraint = authority.key() == pool.authority @ PoolError::Unauthorized
    )]
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<CloseLosingBet>, _side: Side) -> Result<()> {
    let winner = ctx.accounts.pool.winner.ok_or(PoolError::NotResolved)?;
    let user_bet = &mut ctx.accounts.user_bet;

    // Only losing-side positions may be closed this way. Winners must go through
    // `claim`, which pays out their winnings AND returns their rent.
    require!(user_bet.side != winner, PoolError::IsWinner);

    // Mark settled; Anchor's `close = user` sends the account's lamports (rent)
    // back to the bettor.
    user_bet.claimed = true;

    Ok(())
}
