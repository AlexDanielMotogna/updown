use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::PoolError;
use crate::events::ParticipantRefunded;
use crate::state::{Tournament, TournamentParticipant, TournamentStatus};

#[derive(Accounts)]
pub struct RefundParticipant<'info> {
    #[account(
        mut,
        constraint = tournament.status == TournamentStatus::Cancelled @ PoolError::TournamentNotCancelled,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        mut,
        seeds = [TournamentParticipant::SEED_PREFIX, tournament.key().as_ref(), user.key().as_ref()],
        bump = participant.bump,
        constraint = participant.user == user.key(),
        constraint = !participant.refunded @ PoolError::TournamentAlreadyRefunded,
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

    /// CHECK: User account — authority drives refunds, no user signature needed
    pub user: AccountInfo<'info>,

    #[account(
        constraint = authority.key() == tournament.authority @ PoolError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<RefundParticipant>) -> Result<()> {
    let entry_fee = ctx.accounts.tournament.entry_fee;
    let tournament_id = ctx.accounts.tournament.tournament_id;
    let bump = ctx.accounts.tournament.bump;

    // PDA signer seeds
    let seeds = &[Tournament::SEED_PREFIX, tournament_id.as_ref(), &[bump]];
    let signer_seeds = &[&seeds[..]];

    // Transfer entry_fee back from vault to user
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.tournament.to_account_info(),
            },
            signer_seeds,
        ),
        entry_fee,
    )?;

    // Update counters
    let tournament = &mut ctx.accounts.tournament;
    tournament.prize_pool = tournament.prize_pool
        .checked_sub(entry_fee).unwrap();
    tournament.participant_count = tournament.participant_count.saturating_sub(1);

    // Mark refunded
    ctx.accounts.participant.refunded = true;

    emit!(ParticipantRefunded {
        tournament_id: tournament.tournament_id,
        user: ctx.accounts.user.key(),
        amount: tournament.entry_fee,
    });

    Ok(())
}
