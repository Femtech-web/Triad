use anchor_lang::prelude::*;
use anchor_spl::token_interface::{close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::error::EscrowError;
use crate::state::{Escrow, EscrowState, ESCROW_SEED};

#[event]
pub struct Refunded {
    pub shipment_id: [u8; 32],
    pub buyer: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(shipment_id: [u8; 32])]
pub struct Refund<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut, seeds = [ESCROW_SEED, shipment_id.as_ref()], bump = escrow.bump, has_one = mint, constraint = escrow.buyer == buyer.key() @ EscrowError::NotBuyer)]
    pub escrow: Account<'info, Escrow>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = escrow, associated_token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = buyer, token::token_program = token_program)]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<Refund>, shipment_id: [u8; 32]) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    require!(escrow.state == EscrowState::Funded, EscrowError::NotFunded);
    require!(Clock::get()?.unix_timestamp >= escrow.refund_after, EscrowError::RefundTooEarly);

    let amount = escrow.amount;
    let seeds: &[&[u8]] = &[ESCROW_SEED, shipment_id.as_ref(), &[escrow.bump]];
    let signer = &[seeds];
    transfer_checked(
        CpiContext::new_with_signer(ctx.accounts.token_program.key(), TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.buyer_token.to_account_info(),
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

    ctx.accounts.escrow.state = EscrowState::Refunded;
    emit!(Refunded { shipment_id, buyer: ctx.accounts.buyer.key(), amount });
    Ok(())
}
