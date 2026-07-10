use anchor_lang::prelude::*;

use crate::errors::PoolError;
use crate::events::TournamentResolved;
use crate::state::{Tournament, TournamentParticipant, TournamentStatus};

/// Resolve a tournament: authority sets the winner and marks it Completed. This
/// is the transition `claim_tournament_prize` gates on — without it the prize
/// vault is unclaimable. Winner is proven to be a registered participant by
/// passing their participant PDA (derived from tournament + winner), so the
/// authority can't name a non-participant. Registering or Active → Completed;
/// a Completed or Cancelled tournament is rejected.
#[derive(Accounts)]
#[instruction(winner: Pubkey)]
pub struct ResolveTournament<'info> {
    #[account(
        mut,
        has_one = authority @ PoolError::Unauthorized,
        constraint = tournament.status != TournamentStatus::Completed @ PoolError::TournamentAlreadyResolved,
        constraint = tournament.status != TournamentStatus::Cancelled @ PoolError::InvalidPoolStatus,
    )]
    pub tournament: Account<'info, Tournament>,

    /// The winner's participant PDA. Its address is derived from `winner`, so a
    /// valid account here proves the winner actually registered for this
    /// tournament.
    #[account(
        seeds = [TournamentParticipant::SEED_PREFIX, tournament.key().as_ref(), winner.as_ref()],
        bump = participant.bump,
    )]
    pub participant: Account<'info, TournamentParticipant>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<ResolveTournament>, winner: Pubkey) -> Result<()> {
    let tournament = &mut ctx.accounts.tournament;
    tournament.status = TournamentStatus::Completed;
    tournament.winner = Some(winner);

    emit!(TournamentResolved {
        tournament_id: tournament.tournament_id,
        winner,
    });

    Ok(())
}
