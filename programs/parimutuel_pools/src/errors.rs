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

    #[msg("Cannot change sides: deposits must be on the same side as your first bet")]
    SideMismatch,

    #[msg("User did not win this pool")]
    NotWinner,

    #[msg("Payout already claimed")]
    AlreadyClaimed,

    #[msg("Invalid pool status for this operation")]
    InvalidPoolStatus,

    #[msg("Unauthorized: only authority can resolve")]
    Unauthorized,

    #[msg("Invalid time configuration: lock_time must be before end_time")]
    InvalidTimeConfig,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("No bets on winning side")]
    NoWinningBets,

    #[msg("Fee basis points must be <= 10000")]
    InvalidFeeBps,

    #[msg("Vault still has tokens — all claims/refunds must be processed first")]
    VaultNotEmpty,

    #[msg("Invalid side for this pool (e.g., Draw on a 2-side pool)")]
    InvalidSide,

    #[msg("Invalid number of sides: must be 2 or 3")]
    InvalidNumSides,

    // ── Tournament errors ──

    #[msg("Tournament is not in registering status")]
    TournamentNotRegistering,

    #[msg("Tournament is full")]
    TournamentFull,

    #[msg("Tournament is not completed")]
    TournamentNotCompleted,

    #[msg("User is not the tournament winner")]
    TournamentNotWinner,

    #[msg("Tournament prize already claimed")]
    TournamentAlreadyClaimed,

    #[msg("Tournament is not cancelled")]
    TournamentNotCancelled,

    #[msg("Tournament participant already refunded")]
    TournamentAlreadyRefunded,

    #[msg("Tournament vault still has tokens")]
    TournamentVaultNotEmpty,
}
