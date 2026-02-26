use anchor_lang::prelude::*;

#[error_code]
pub enum PoolError {
    #[msg("Pool is not in joining status")]
    NotJoining,

    #[msg("Deposit deadline has passed")]
    DepositDeadlinePassed,

    #[msg("Pool has not ended yet")]
    PoolNotEnded,

    #[msg("Pool is not active")]
    NotActive,

    #[msg("Pool is not resolved")]
    NotResolved,

    #[msg("Deposit amount must be greater than zero")]
    ZeroDeposit,

    #[msg("User bet already exists")]
    BetAlreadyExists,

    #[msg("User did not win this pool")]
    NotWinner,

    #[msg("Payout already claimed")]
    AlreadyClaimed,

    #[msg("Invalid pool status for this operation")]
    InvalidPoolStatus,

    #[msg("Unauthorized: only authority can resolve")]
    Unauthorized,

    #[msg("Invalid time configuration: lock_time must be before start_time, start_time must be before end_time")]
    InvalidTimeConfig,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("No bets on winning side")]
    NoWinningBets,
}
