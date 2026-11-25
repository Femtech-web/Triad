use anchor_lang::prelude::*;
use anchor_lang::compat::solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked};

use crate::error::EscrowError;

pub const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

/// Domain tag for release authorizations, so a signature made for anything else can never release an escrow.
pub const RELEASE_DOMAIN: &[u8; 8] = b"TRIADRL1";
pub const RELEASE_MESSAGE_LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 32 + 8;

/// The bytes the release officer signs: the program (as a domain), the shipment, the exact payee, mint and amount,
/// the evidence file's hash and the authorization's expiry. Fixed-width little-endian, so clients encode it exactly.
pub fn release_message(
    program_id: &Pubkey,
    shipment_id: &[u8; 32],
    payee: &Pubkey,
    mint: &Pubkey,
    amount: u64,
    evidence_hash: &[u8; 32],
    valid_until: i64,
) -> [u8; RELEASE_MESSAGE_LEN] {
    let mut message = [0u8; RELEASE_MESSAGE_LEN];
    let parts: [&[u8]; 8] = [
        RELEASE_DOMAIN,
        program_id.as_ref(),
        shipment_id,
        payee.as_ref(),
        mint.as_ref(),
        &amount.to_le_bytes(),
        evidence_hash,
        &valid_until.to_le_bytes(),
    ];
    let mut at = 0;
    for part in parts {
        message[at..at + part.len()].copy_from_slice(part);
        at += part.len();
    }
    message
}

/// The instruction just before this one must be the ed25519 program verifying exactly one signature, by `signer`,
/// over `message`, with every offset pointing inside that instruction. The ed25519 program has already rejected the
/// transaction if the signature itself is invalid; this checks it was the right signer over the right bytes.
pub fn verify_release_signature(instructions_sysvar: &AccountInfo, signer: &Pubkey, message: &[u8]) -> Result<()> {
    let current = load_current_index_checked(instructions_sysvar)? as usize;
    require!(current > 0, EscrowError::MissingAuthorization);
    let instruction = load_instruction_at_checked(current - 1, instructions_sysvar)?;
    require_keys_eq!(instruction.program_id, ED25519_PROGRAM_ID, EscrowError::MissingAuthorization);

    let data = instruction.data.as_slice();
    require!(data.len() >= 16 && data[0] == 1, EscrowError::BadAuthorization);
    let read = |at: usize| u16::from_le_bytes([data[at], data[at + 1]]);
    let (signature_offset, signature_ix, key_offset, key_ix, message_offset, message_size, message_ix) =
        (read(2), read(4), read(6), read(8), read(10), read(12), read(14));
    // u16::MAX means "this instruction". Data borrowed from another instruction is how forged authorizations pass.
    require!(signature_ix == u16::MAX && key_ix == u16::MAX && message_ix == u16::MAX, EscrowError::BadAuthorization);

    let slice = |offset: u16, len: usize| data.get(offset as usize..offset as usize + len).ok_or(EscrowError::BadAuthorization);
    require!(slice(signature_offset, 64).is_ok(), EscrowError::BadAuthorization);
    require!(slice(key_offset, 32)? == signer.as_ref(), EscrowError::BadAuthorization);
    require!(message_size as usize == message.len() && slice(message_offset, message.len())? == message, EscrowError::BadAuthorization);
    Ok(())
}
