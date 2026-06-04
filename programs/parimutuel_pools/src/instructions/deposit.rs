use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::PoolError;
use crate::events::Deposited;
use crate::state::{Pool, PoolStatus, UserBet};
use crate::Side;

#[derive(Accounts)]
#[instruction(side: Side, amount: u64)]
pub struct Deposit<'info> {
    #[account(
        mut,
        constraint = pool.status == PoolStatus::Joining @ PoolError::NotJoining
    )]
    pub pool: Account<'info, Pool>,

    // One UserBet account per (pool, user, side): the `side` byte is part of the
    // seeds, so the same wallet can hold independent positions on multiple sides
    // (hedge). Each side's account is created/accumulated separately.
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserBet::INIT_SPACE,
        seeds = [UserBet::SEED_PREFIX, pool.key().as_ref(), user.key().as_ref(), &[side as u8]],
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

    // Validate side is allowed for this pool
    if side == Side::Draw {
        require!(pool.num_sides == 3, PoolError::InvalidSide);
    }

    // Transfer USDC from user to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Time-weight multiplier in BPS (10_000 = 1.0). Computed against the
    // deposit's actual timestamp so a hedger top-up later in the window
    // gets a smaller weight contribution than the initial bet.
    let multiplier_bps = pool.multiplier_bps(clock.unix_timestamp);
    let weight_added: u64 = (amount as u128)
        .checked_mul(multiplier_bps as u128)
        .ok_or(PoolError::Overflow)?
        .checked_div(10_000u128)
        .ok_or(PoolError::Overflow)? as u64;

    // Update pool totals (raw + weighted) atomically per side.
    match side {
        Side::Up => {
            pool.total_up = pool.total_up.checked_add(amount).ok_or(PoolError::Overflow)?;
            pool.weighted_up = pool.weighted_up.checked_add(weight_added).ok_or(PoolError::Overflow)?;
        }
        Side::Down => {
            pool.total_down = pool.total_down.checked_add(amount).ok_or(PoolError::Overflow)?;
            pool.weighted_down = pool.weighted_down.checked_add(weight_added).ok_or(PoolError::Overflow)?;
        }
        Side::Draw => {
            pool.total_draw = pool.total_draw.checked_add(amount).ok_or(PoolError::Overflow)?;
            pool.weighted_draw = pool.weighted_draw.checked_add(weight_added).ok_or(PoolError::Overflow)?;
        }
    }

    // Initialize (first deposit on this side) or accumulate. The per-side PDA seed
    // guarantees this account belongs to `side`, so re-deposits just add to it.
    let user_bet = &mut ctx.accounts.user_bet;
    if user_bet.user == Pubkey::default() {
        // New bet - initialize all fields including time-weight tracking.
        user_bet.pool = pool.key();
        user_bet.user = ctx.accounts.user.key();
        user_bet.side = side;
        user_bet.amount = amount;
        user_bet.weight = weight_added;
        user_bet.entry_time = clock.unix_timestamp;
        user_bet.claimed = false;
        user_bet.bump = ctx.bumps.user_bet;
    } else {
        // Same side guaranteed by the per-side seed — accumulate amount AND
        // weight. entry_time stays as the FIRST deposit; the analytics field
        // tracks initial entry, not last top-up.
        user_bet.amount = user_bet.amount.checked_add(amount).ok_or(PoolError::Overflow)?;
        user_bet.weight = user_bet.weight.checked_add(weight_added).ok_or(PoolError::Overflow)?;
    }

    emit!(Deposited {
        pool_id: pool.pool_id,
        user: ctx.accounts.user.key(),
        side,
        amount,
        weight: weight_added,
        multiplier_bps,
        total_up: pool.total_up,
        total_down: pool.total_down,
        total_draw: pool.total_draw,
    });

    Ok(())
}
