use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum EscrowState {
    Funded,
    Released,
    Refunded,
}

/// One shipment's escrow. Kept after release or refund as the on-chain record of how it ended.
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub shipment_id: [u8; 32],
    pub buyer: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub release_officer: Pubkey,
    pub refund_after: i64,
    pub state: EscrowState,
    pub evidence_hash: [u8; 32],
    pub bump: u8,
}

pub const ESCROW_SEED: &[u8] = b"escrow";
