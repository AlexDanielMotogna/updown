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
}

#[event]
pub struct Deposited {
    pub pool_id: [u8; 32],
    pub user: Pubkey,
    pub side: Side,
    pub amount: u64,
    pub total_up: u64,
    pub total_down: u64,
}

#[event]
pub struct PoolResolved {
    pub pool_id: [u8; 32],
    pub strike_price: u64,
    pub final_price: u64,
    pub winner: Side,
    pub total_up: u64,
    pub total_down: u64,
}

#[event]
pub struct PayoutClaimed {
    pub pool_id: [u8; 32],
    pub user: Pubkey,
    pub amount: u64,
    pub side: Side,
}
