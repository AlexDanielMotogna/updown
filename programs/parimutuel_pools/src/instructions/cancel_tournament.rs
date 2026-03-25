use anchor_lang::prelude::*;

use crate::errors::PoolError;
use crate::events::TournamentCancelled;
use crate::state::{Tournament, TournamentStatus};

#[derive(Accounts)]
pub struct CancelTournament<'info> {
    #[account(
        mut,
        has_one = authority,
        constraint = tournament.status == TournamentStatus::Registering @ PoolError::InvalidPoolStatus,
    )]
    pub tournament: Account<'info, Tournament>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<CancelTournament>) -> Result<()> {
    ctx.accounts.tournament.status = TournamentStatus::Cancelled;

    emit!(TournamentCancelled {
        tournament_id: ctx.accounts.tournament.tournament_id,
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}
