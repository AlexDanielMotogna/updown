use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::PoolError;
use crate::events::ParticipantRegistered;
use crate::state::{Tournament, TournamentParticipant, TournamentStatus};

#[derive(Accounts)]
pub struct RegisterParticipant<'info> {
    #[account(
        mut,
        constraint = tournament.status == TournamentStatus::Registering @ PoolError::TournamentNotRegistering,
        constraint = tournament.participant_count < tournament.max_participants @ PoolError::TournamentFull,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        init,
        payer = user,
        space = 8 + TournamentParticipant::INIT_SPACE,
        seeds = [TournamentParticipant::SEED_PREFIX, tournament.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub participant: Account<'info, TournamentParticipant>,

    #[account(
        mut,
        constraint = vault.key() == tournament.vault
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == tournament.usdc_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterParticipant>) -> Result<()> {
    let entry_fee = ctx.accounts.tournament.entry_fee;

    // Transfer entry_fee from user to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        entry_fee,
    )?;

    // Update tournament
    let tournament = &mut ctx.accounts.tournament;
    tournament.prize_pool = tournament.prize_pool
        .checked_add(entry_fee)
        .ok_or(PoolError::Overflow)?;
    tournament.participant_count += 1;

    // Initialize participant PDA
    let participant = &mut ctx.accounts.participant;
    participant.tournament = tournament.key();
    participant.user = ctx.accounts.user.key();
    participant.refunded = false;
    participant.claimed = false;
    participant.bump = ctx.bumps.participant;

    emit!(ParticipantRegistered {
        tournament_id: tournament.tournament_id,
        user: ctx.accounts.user.key(),
        entry_fee: tournament.entry_fee,
        prize_pool: tournament.prize_pool,
        participant_count: tournament.participant_count,
    });

    Ok(())
}
