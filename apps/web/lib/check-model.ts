import { z } from 'zod';
import type { Instruction, Shipment } from '@triad/core';

// The everyday version of a case: who you pay, the email you received, and what it asks to change. The browser and the
// server both turn it into the same record and instruction, so the instant pre-check and the paid run agree.

const iso = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Choose a country');
const name = z.string().trim().min(2, 'Too short').max(200);
const account = z.string().trim().min(4, 'Enter the account number or IBAN').max(64).transform((v) => v.replace(/\s+/g, '').toUpperCase());
const email = z.string().trim().toLowerCase().email('Enter an email address');
const domain = z.string().trim().toLowerCase().transform((v) => v.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, ''))
  .pipe(z.string().regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'Enter a domain like glencore.com'));
const phone = z.string().trim().transform((v) => v.replace(/[\s().-]/g, '')).pipe(z.string().regex(/^\+[1-9]\d{6,14}$/, 'Use the international format, +41 …'));

export const checkInputSchema = z.object({
  supplier: z.object({ legalName: name, country: iso, domain, registrationId: z.string().trim().max(64).optional() }),
  account: z.object({ holder: name, number: account }),
  contact: z.object({ name: z.string().trim().min(1, 'Enter a name').max(120), email, phone: phone.optional() }),
  email: z.object({ fromName: z.string().trim().max(120), from: email, replyTo: email.optional(), message: z.string().trim().min(1, 'Paste the message').max(2000) }),
  change: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('payout'), holder: name, number: account }),
    z.object({ kind: z.literal('pickup'), legalName: name, country: iso }),
  ]),
});
export type CheckInput = z.input<typeof checkInputSchema>;
export type ParsedCheck = z.output<typeof checkInputSchema>;

// A bank account has no on-chain address, but the record needs one: derive a stable placeholder from the account
// number. Change detection compares the account number itself, and nothing is ever paid from this flow.
function placeholderAddress(accountNumber: string): string {
  let hex = '';
  for (let seed = 0; hex.length < 40; seed++) {
    let h = 0x811c9dc5 ^ seed;
    for (const ch of `triad:account:${accountNumber}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    hex += h.toString(16).padStart(8, '0');
  }
  return `0x${hex.slice(0, 40)}`;
}

const NO_OFFICER = '0x0000000000000000000000000000000000000000';
export const CHECK_SYNTHETIC = ['payout addresses (placeholders derived from the account numbers entered; nothing is paid from this check)'];

export function toCase(input: ParsedCheck, id: string): { shipment: Shipment; instruction: Instruction } {
  const seller = {
    id: 'seller', legalName: input.supplier.legalName, country: input.supplier.country, domain: input.supplier.domain,
    ...(input.supplier.registrationId ? { registrationId: input.supplier.registrationId } : {}),
    contacts: [{ id: 'contact', name: input.contact.name, email: input.contact.email, role: 'Contact on file', ...(input.contact.phone ? { phone: input.contact.phone } : {}) }],
  };
  const you = { id: 'buyer', legalName: 'Your company', country: input.supplier.country, contacts: [] };
  const shipment: Shipment = {
    id, reference: 'Your payment', commodity: 'Goods or services', quantity: 'As invoiced',
    amount: { value: '0', currency: 'USD', decimals: 2 },
    buyer: you, seller, consignee: you,
    payout: { holderName: input.account.holder, rail: 'sepolia', address: placeholderAddress(input.account.number), bankRef: input.account.number },
    documents: [], authorizedContactIds: ['contact'],
    releaseOfficer: { name: 'No release from a check', rail: 'sepolia', publicKey: NO_OFFICER },
  };
  const change = input.change;
  const instruction: Instruction = {
    id: `ins-${id}`, shipmentId: id, receivedAt: new Date().toISOString(),
    channel: { kind: 'email', from: input.email.from, displayName: input.email.fromName, ...(input.email.replyTo ? { replyTo: input.email.replyTo } : {}) },
    summary: input.email.message,
    changes: change.kind === 'payout' ? { payout: { holderName: change.holder, rail: 'sepolia', address: placeholderAddress(change.number), bankRef: change.number } }
      : change.kind === 'pickup' ? { pickupParty: { id: 'pickup-new', legalName: change.legalName, country: change.country, contacts: [] } }
        : {},
  };
  return { shipment, instruction };
}
