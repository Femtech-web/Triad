use anchor_lang::prelude::*;
use anchor_lang::compat::solana_instructions_sysvar::ID as INSTRUCTIONS_SYSVAR_ID;
use anchor_spl::token_interface::{close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::authorization::{release_message, verify_release_signature};
use crate::error::EscrowError;
use crate::state::{Escrow, EscrowState, ESCROW_SEED};

#[event]
pub struct Released {
    pub shipment_id: [u8; 32],
    pub payee: Pubkey,
    pub amount: u64,
    pub evidence_hash: [u8; 32],
}

#[derive(Accounts)]
#[instruction(shipment_id: [u8; 32])]
pub struct Release<'info> {
    /// Anyone may submit a valid authorization; only the signed payee is paid.
    #[account(mut)]
    pub relayer: Signer<'info>,
    #[account(mut, seeds = [ESCROW_SEED, shipment_id.as_ref()], bump = escrow.bump, has_one = mint, has_one = buyer)]
    pub escrow: Account<'info, Escrow>,
    /// CHECK: receives the vault's rent when it closes; must be the escrow's buyer (has_one above).
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = escrow, associated_token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: any address; bound to the release by the officer's signature over it.
    pub payee: UncheckedAccount<'info>,
    #[account(mut, token::mint = mint, token::authority = payee, token::token_program = token_program)]
    pub payee_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: the instructions sysvar, read to find the ed25519 verification before this instruction.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<Release>, shipment_id: [u8; 32], evidence_hash: [u8; 32], valid_until: i64) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    require!(escrow.state == EscrowState::Funded, EscrowError::NotFunded);
    require!(Clock::get()?.unix_timestamp <= valid_until, EscrowError::AuthorizationExpired);
    let message = release_message(ctx.program_id, &shipment_id, ctx.accounts.payee.key, &escrow.mint, escrow.amount, &evidence_hash, valid_until);
    verify_release_signature(&ctx.accounts.instructions.to_account_info(), &escrow.release_officer, &message)?;

    let amount = escrow.amount;
    let seeds: &[&[u8]] = &[ESCROW_SEED, shipment_id.as_ref(), &[escrow.bump]];
    let signer = &[seeds];
    transfer_checked(
        CpiContext::new_with_signer(ctx.accounts.token_program.key(), TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.payee_token.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        }, signer),
        amount,
        ctx.accounts.mint.decimals,
    )?;
    close_account(CpiContext::new_with_signer(ctx.accounts.token_program.key(), CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.buyer.to_account_info(),
        authority: ctx.accounts.escrow.to_account_info(),
    }, signer))?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.state = EscrowState::Released;
    escrow.evidence_hash = evidence_hash;
    emit!(Released { shipment_id, payee: ctx.accounts.payee.key(), amount, evidence_hash });
    Ok(())
}
