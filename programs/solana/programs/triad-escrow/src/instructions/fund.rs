use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::error::EscrowError;
use crate::state::{Escrow, EscrowState, ESCROW_SEED};

#[event]
pub struct Funded {
    pub shipment_id: [u8; 32],
    pub buyer: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub release_officer: Pubkey,
    pub refund_after: i64,
}

#[derive(Accounts)]
#[instruction(shipment_id: [u8; 32])]
pub struct Fund<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = buyer, token::token_program = token_program)]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    // `init` fails if the shipment was ever funded, so each shipment has one escrow.
    #[account(init, payer = buyer, space = 8 + Escrow::INIT_SPACE, seeds = [ESCROW_SEED, shipment_id.as_ref()], bump)]
    pub escrow: Account<'info, Escrow>,
    #[account(init, payer = buyer, associated_token::mint = mint, associated_token::authority = escrow, associated_token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Fund>, shipment_id: [u8; 32], amount: u64, release_officer: Pubkey, refund_after: i64) -> Result<()> {
    require!(amount > 0 && refund_after > Clock::get()?.unix_timestamp, EscrowError::InvalidEscrow);
    let escrow = &mut ctx.accounts.escrow;
    escrow.set_inner(Escrow {
        shipment_id,
        buyer: ctx.accounts.buyer.key(),
        mint: ctx.accounts.mint.key(),
        amount,
        release_officer,
        refund_after,
        state: EscrowState::Funded,
        evidence_hash: [0; 32],
        bump: ctx.bumps.escrow,
    });
    transfer_checked(
        CpiContext::new(ctx.accounts.token_program.key(), TransferChecked {
            from: ctx.accounts.buyer_token.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        }),
        amount,
        ctx.accounts.mint.decimals,
    )?;
    emit!(Funded { shipment_id, buyer: escrow.buyer, mint: escrow.mint, amount, release_officer, refund_after });
    Ok(())
}
