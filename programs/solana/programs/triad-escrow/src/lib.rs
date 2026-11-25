//! Triad escrow on Solana. Holds a buyer's payment for one shipment until the shipment's release officer signs,
//! with ed25519, the exact payee, amount and evidence hash. Mirrors contracts/evm/src/ShipmentEscrow.sol.
pub mod authorization;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use authorization::*;
pub use instructions::*;
pub use state::*;

declare_id!("7hRAkLUZ2EMuFpsc3mtKfKnfxUJvcbgJqhWDShtxz567");

#[program]
pub mod triad_escrow {
    use super::*;

    /// Locks `amount` of `mint` from the buyer for `shipment_id`.
    pub fn fund(ctx: Context<Fund>, shipment_id: [u8; 32], amount: u64, release_officer: Pubkey, refund_after: i64) -> Result<()> {
        instructions::fund::handler(ctx, shipment_id, amount, release_officer, refund_after)
    }

    /// Pays the full escrow to `payee`; the transaction must carry the officer's ed25519 authorization just before.
    pub fn release(ctx: Context<Release>, shipment_id: [u8; 32], evidence_hash: [u8; 32], valid_until: i64) -> Result<()> {
        instructions::release::handler(ctx, shipment_id, evidence_hash, valid_until)
    }

    /// Returns the escrow to the buyer after `refund_after` if it was never released.
    pub fn refund(ctx: Context<Refund>, shipment_id: [u8; 32]) -> Result<()> {
        instructions::refund::handler(ctx, shipment_id)
    }
}
