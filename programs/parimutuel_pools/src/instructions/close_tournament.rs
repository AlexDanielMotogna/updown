use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, CloseAccount};

use crate::errors::PoolError;
use crate::events::TournamentClosed;
use crate::state::{Tournament, TournamentStatus};

#[derive(Accounts)]
pub struct CloseTournament<'info> {
    #[account(
        mut,
        close = authority,
        has_one = authority,
        constraint = tournament.status == TournamentStatus::Completed
            || tournament.status == TournamentStatus::Cancelled @ PoolError::InvalidPoolStatus,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        mut,
        seeds = [Tournament::VAULT_SEED_PREFIX, tournament.tournament_id.as_ref()],
        bump = tournament.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CloseTournament>) -> Result<()> {
    require!(ctx.accounts.vault.amount == 0, PoolError::TournamentVaultNotEmpty);

    let rent_reclaimed = ctx.accounts.vault.to_account_info().lamports()
        + ctx.accounts.tournament.to_account_info().lamports();

    // Close vault token account
    let tournament_id = ctx.accounts.tournament.tournament_id;
    let seeds = &[
        Tournament::SEED_PREFIX,
        tournament_id.as_ref(),
        &[ctx.accounts.tournament.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: ctx.accounts.tournament.to_account_info(),
        },
        signer_seeds,
    ))?;

    emit!(TournamentClosed {
        tournament_id,
        authority: ctx.accounts.authority.key(),
        rent_reclaimed,
    });

    Ok(())
}
