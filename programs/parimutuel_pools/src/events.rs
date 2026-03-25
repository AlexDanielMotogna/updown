use anchor_lang::prelude::*;
use crate::Side;

#[event]
pub struct PoolCreated {
    pub pool_id: [u8; 32],
    pub asset: String,
    pub authority: Pubkey,
    pub start_time: i64,
    pub end_time: i64,
    pub lock_time: i64,
    pub strike_price: u64,
    pub num_sides: u8,
}

#[event]
pub struct Deposited {
    pub pool_id: [u8; 32],
    pub user: Pubkey,
    pub side: Side,
    pub amount: u64,
    pub total_up: u64,
    pub total_down: u64,
    pub total_draw: u64,
}

#[event]
pub struct PoolResolved {
    pub pool_id: [u8; 32],
    pub strike_price: u64,
    pub final_price: u64,
    pub winner: Side,
    pub total_up: u64,
    pub total_down: u64,
    pub total_draw: u64,
}

#[event]
pub struct PayoutClaimed {
    pub pool_id: [u8; 32],
    pub user: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub side: Side,
}

#[event]
pub struct Refunded {
    pub pool_id: [u8; 32],
    pub user: Pubkey,
    pub amount: u64,
    pub side: Side,
}

#[event]
pub struct PoolClosed {
    pub pool_id: [u8; 32],
    pub authority: Pubkey,
    pub rent_reclaimed: u64,
}

// ── Tournament events ──

#[event]
pub struct TournamentCreated {
    pub tournament_id: [u8; 32],
    pub authority: Pubkey,
    pub entry_fee: u64,
    pub max_participants: u16,
}

#[event]
pub struct ParticipantRegistered {
    pub tournament_id: [u8; 32],
    pub user: Pubkey,
    pub entry_fee: u64,
    pub prize_pool: u64,
    pub participant_count: u16,
}

#[event]
pub struct TournamentPrizeClaimed {
    pub tournament_id: [u8; 32],
    pub winner: Pubkey,
    pub prize_amount: u64,
    pub fee: u64,
}

#[event]
pub struct TournamentCancelled {
    pub tournament_id: [u8; 32],
    pub authority: Pubkey,
}

#[event]
pub struct ParticipantRefunded {
    pub tournament_id: [u8; 32],
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TournamentClosed {
    pub tournament_id: [u8; 32],
    pub authority: Pubkey,
    pub rent_reclaimed: u64,
}
