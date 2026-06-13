//! Centralized money-math tests for the parimutuel program (P0.2).
//!
//! These are HOST-side unit tests of the pure payout arithmetic — no validator,
//! no RPC, no accounts. They lock the invariants that, if broken, move funds:
//!   * the time-weight multiplier (`Pool::multiplier_bps`),
//!   * the pool totals (`Pool::total_pool` and the per-side getters),
//!   * the claim share + conservation (`Pool::winnings_for`).
//!
//! Run from a working Rust host toolchain (e.g. WSL):
//!   cargo test -p parimutuel_pools --test money_math
//!
//! New money-math invariants should land HERE rather than scattered inline, so
//! there is a single place to read what the contract guarantees about funds.

use anchor_lang::prelude::Pubkey;
use parimutuel_pools::state::{Pool, PoolStatus, WEIGHT_FLOOR_BPS};
use parimutuel_pools::Side;

/// Build a Pool fixture. Only the fields the money math reads matter; the rest
/// are zeroed. `start`/`lock` drive the time-weight, the `total_*`/`weighted_*`
/// drive totals and the claim share.
#[allow(clippy::too_many_arguments)]
fn mk_pool(
    start_time: i64,
    lock_time: i64,
    total_up: u64,
    total_down: u64,
    total_draw: u64,
    weighted_up: u64,
    weighted_down: u64,
    weighted_draw: u64,
) -> Pool {
    Pool {
        pool_id: [0u8; 32],
        asset: String::new(),
        authority: Pubkey::default(),
        usdc_mint: Pubkey::default(),
        vault: Pubkey::default(),
        start_time,
        end_time: lock_time,
        lock_time,
        strike_price: 0,
        final_price: 0,
        total_up,
        total_down,
        total_draw,
        weighted_up,
        weighted_down,
        weighted_draw,
        num_sides: 2,
        status: PoolStatus::Resolved,
        winner: Some(Side::Up),
        bump: 0,
        vault_bump: 0,
    }
}

// ── time-weight multiplier ────────────────────────────────────────────────

#[test]
fn multiplier_full_at_open() {
    // now == start_time → the whole window remains → multiplier == 1.0 (10_000).
    let p = mk_pool(1_000, 2_000, 0, 0, 0, 0, 0, 0);
    assert_eq!(p.multiplier_bps(1_000), 10_000);
}

#[test]
fn multiplier_floor_at_lock() {
    // now == lock_time → no window remains → clamped UP to the floor, never 0
    // (a last-second winner must still recover principal + a little).
    let p = mk_pool(1_000, 2_000, 0, 0, 0, 0, 0, 0);
    assert_eq!(p.multiplier_bps(2_000), WEIGHT_FLOOR_BPS);
}

#[test]
fn multiplier_linear_midpoint() {
    // Halfway through the window → 50% remaining → 5_000 bps.
    let p = mk_pool(0, 1_000, 0, 0, 0, 0, 0, 0);
    assert_eq!(p.multiplier_bps(500), 5_000);
}

#[test]
fn multiplier_clamps_before_open_and_after_lock() {
    let p = mk_pool(1_000, 2_000, 0, 0, 0, 0, 0, 0);
    // Before the window opens → clamp to start → full credit.
    assert_eq!(p.multiplier_bps(0), 10_000);
    // After the window closes → clamp to lock → floor.
    assert_eq!(p.multiplier_bps(9_999), WEIGHT_FLOOR_BPS);
}

#[test]
fn multiplier_degenerate_window_returns_floor() {
    // start_time >= lock_time (no betting window) must not divide-by-zero; it
    // falls back to the floor so resolution degrades to flat-rate payouts.
    let p = mk_pool(2_000, 2_000, 0, 0, 0, 0, 0, 0);
    assert_eq!(p.multiplier_bps(2_000), WEIGHT_FLOOR_BPS);
    let inverted = mk_pool(3_000, 1_000, 0, 0, 0, 0, 0, 0);
    assert_eq!(inverted.multiplier_bps(2_000), WEIGHT_FLOOR_BPS);
}

#[test]
fn multiplier_never_below_floor() {
    // Very late inside a long window: tiny remaining fraction still floors.
    let p = mk_pool(0, 1_000_000, 0, 0, 0, 0, 0, 0);
    assert_eq!(p.multiplier_bps(999_999), WEIGHT_FLOOR_BPS);
}

// ── pool totals ───────────────────────────────────────────────────────────

#[test]
fn total_pool_sums_all_sides() {
    let p = mk_pool(0, 1, 100, 200, 50, 0, 0, 0);
    assert_eq!(p.total_pool().unwrap(), 350);
}

#[test]
fn total_pool_detects_overflow() {
    let p = mk_pool(0, 1, u64::MAX, 1, 0, 0, 0, 0);
    assert!(p.total_pool().is_err());
}

#[test]
fn total_for_side_selects_correct_bucket() {
    let p = mk_pool(0, 1, 100, 200, 50, 0, 0, 0);
    assert_eq!(p.total_for_side(Side::Up), 100);
    assert_eq!(p.total_for_side(Side::Down), 200);
    assert_eq!(p.total_for_side(Side::Draw), 50);
}

// ── claim share (winnings_for) ────────────────────────────────────────────

#[test]
fn winnings_split_losing_pool_by_weight() {
    // UP wins. Winning principal 1000, weighted 1000. Losing pool 500.
    // A bet with weight 200 earns 200/1000 of the 500 losing stake = 100.
    let p = mk_pool(0, 1, 1_000, 500, 0, 1_000, 0, 0);
    assert_eq!(p.winnings_for(200, Side::Up).unwrap(), 100);
    assert_eq!(p.winnings_for(1_000, Side::Up).unwrap(), 500); // whole side
}

#[test]
fn winnings_zero_when_no_losing_pool() {
    // Everyone on the winning side → nothing to win, just principal back.
    let p = mk_pool(0, 1, 1_000, 0, 0, 1_000, 0, 0);
    assert_eq!(p.winnings_for(500, Side::Up).unwrap(), 0);
}

#[test]
fn winnings_error_on_empty_winning_side() {
    // Winner declared on a side with no stake/weight → NoWinningBets (Err),
    // never a divide-by-zero.
    let p = mk_pool(0, 1, 0, 500, 0, 0, 0, 0);
    assert!(p.winnings_for(0, Side::Up).is_err());
}

#[test]
fn conservation_exact_split() {
    // Three winners whose weights divide the losing pool evenly: the sum of
    // their winnings must equal the losing stake EXACTLY (no dust, no overpay).
    let total_up = 1_000;
    let total_down = 500; // losing stake
    let weights = [100u64, 200, 700]; // Σ = 1000 = weighted_up
    let weighted_up: u64 = weights.iter().sum();
    let p = mk_pool(0, 1, total_up, total_down, 0, weighted_up, 0, 0);

    let sum_winnings: u64 = weights.iter().map(|&w| p.winnings_for(w, Side::Up).unwrap()).sum();
    assert_eq!(sum_winnings, total_down, "winnings must exactly redistribute the losing pool");

    // And the vault is fully conserved: Σ(principal + winnings) == total_pool.
    let principal: u64 = weights.iter().sum(); // weight == amount here (all at t=0)
    let total_paid: u64 = principal + sum_winnings;
    assert_eq!(total_paid, p.total_pool().unwrap());
}

#[test]
fn conservation_never_overpays_with_rounding_dust() {
    // Weights that DON'T divide evenly: integer division floors each share, so
    // the sum is <= the losing stake. The invariant that protects the vault is
    // "never pay out more than is in it"; leftover dust (< num_winners) stays in
    // the vault and is swept later. This is the property that matters for funds.
    let total_up = 3;
    let total_down = 10; // losing stake, not divisible by 3
    let weights = [1u64, 1, 1];
    let weighted_up: u64 = weights.iter().sum();
    let p = mk_pool(0, 1, total_up, total_down, 0, weighted_up, 0, 0);

    let sum_winnings: u64 = weights.iter().map(|&w| p.winnings_for(w, Side::Up).unwrap()).sum();
    assert!(sum_winnings <= total_down, "must never redistribute more than the losing pool");
    let dust = total_down - sum_winnings;
    assert!(dust < weights.len() as u64, "rounding dust stays below one unit per winner");
}
