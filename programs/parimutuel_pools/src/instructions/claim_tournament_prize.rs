use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::PoolError;
use crate::events::TournamentPrizeClaimed;
use crate::state::{Tournament, TournamentParticipant, TournamentStatus};

const TOURNAMENT_FEE_BPS: u64 = 500; // 5% enforced on-chain

#[derive(Accounts)]
pub struct ClaimTournamentPrize<'info> {
    #[account(
        mut,
        constraint = tournament.status == TournamentStatus::Completed @ PoolError::TournamentNotCompleted,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        mut,
        seeds = [TournamentParticipant::SEED_PREFIX, tournament.key().as_ref(), user.key().as_ref()],
        bump = participant.bump,
        constraint = participant.user == user.key(),
        constraint = !participant.claimed @ PoolError::TournamentAlreadyClaimed,
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

    /// Authority co-signs (prevents fee manipulation)
    #[account(
        constraint = authority.key() == tournament.authority @ PoolError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// Fee wallet receives platform fee
    #[account(
        mut,
        constraint = fee_wallet.mint == tournament.usdc_mint
    )]
    pub fee_wallet: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimTournamentPrize>) -> Result<()> {
    let tournament = &ctx.accounts.tournament;

    // Verify user is the winner
    let winner = tournament.winner.ok_or(PoolError::TournamentNotCompleted)?;
    require!(winner == ctx.accounts.user.key(), PoolError::TournamentNotWinner);

    // Calculate fee (5% enforced on-chain)
    let fee = (tournament.prize_pool as u128)
        .checked_mul(TOURNAMENT_FEE_BPS as u128).unwrap()
        .checked_div(10000u128).unwrap() as u64;
    let prize_amount = tournament.prize_pool.checked_sub(fee).unwrap();

    // PDA signer seeds
    let tournament_id = tournament.tournament_id;
    let seeds = &[Tournament::SEED_PREFIX, tournament_id.as_ref(), &[tournament.bump]];
    let signer_seeds = &[&seeds[..]];

    // Transfer prize to winner
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
        prize_amount,
    )?;

    // Transfer fee to fee_wallet
    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.fee_wallet.to_account_info(),
                    authority: ctx.accounts.tournament.to_account_info(),
                },
                signer_seeds,
            ),
            fee,
        )?;
    }

    // Mark as claimed
    ctx.accounts.participant.claimed = true;

    emit!(TournamentPrizeClaimed {
        tournament_id: tournament.tournament_id,
        winner: ctx.accounts.user.key(),
        prize_amount,
        fee,
    });

    Ok(())
}
