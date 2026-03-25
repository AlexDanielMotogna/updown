use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::events::TournamentCreated;
use crate::state::{Tournament, TournamentStatus};

#[derive(Accounts)]
#[instruction(tournament_id: [u8; 32])]
pub struct InitializeTournament<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Tournament::INIT_SPACE,
        seeds = [Tournament::SEED_PREFIX, tournament_id.as_ref()],
        bump
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        init,
        payer = authority,
        seeds = [Tournament::VAULT_SEED_PREFIX, tournament_id.as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = tournament,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeTournament>,
    tournament_id: [u8; 32],
    entry_fee: u64,
    max_participants: u16,
) -> Result<()> {
    let tournament = &mut ctx.accounts.tournament;
    tournament.tournament_id = tournament_id;
    tournament.authority = ctx.accounts.authority.key();
    tournament.usdc_mint = ctx.accounts.usdc_mint.key();
    tournament.vault = ctx.accounts.vault.key();
    tournament.entry_fee = entry_fee;
    tournament.max_participants = max_participants;
    tournament.participant_count = 0;
    tournament.prize_pool = 0;
    tournament.status = TournamentStatus::Registering;
    tournament.winner = None;
    tournament.bump = ctx.bumps.tournament;
    tournament.vault_bump = ctx.bumps.vault;

    emit!(TournamentCreated {
        tournament_id,
        authority: ctx.accounts.authority.key(),
        entry_fee,
        max_participants,
    });

    Ok(())
}
