use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be positive and the refund time in the future")]
    InvalidEscrow,
    #[msg("The escrow is not funded")]
    NotFunded,
    #[msg("The release authorization has expired")]
    AuthorizationExpired,
    #[msg("The transaction carries no ed25519 release authorization")]
    MissingAuthorization,
    #[msg("The release authorization is not signed by the release officer for exactly this release")]
    BadAuthorization,
    #[msg("Only the buyer can refund")]
    NotBuyer,
    #[msg("The refund time has not been reached")]
    RefundTooEarly,
}
