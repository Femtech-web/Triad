import type { Effect, OutcomeStatus } from '@triad/core';

export type Verdict = 'CLEAR' | 'HOLD' | 'BLOCK';

export const short = (value: string, head = 10, tail = 6) => (value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value);
export const usdc = (uusdc: string | bigint | number) => `${(Number(uusdc) / 1e6).toFixed(2)} test USDC`;
export const verdictClass = (v: Verdict) => v.toLowerCase();

export const EFFECT_LABEL: Record<Effect, string> = { block: 'blocks', hold_callback: 'needs callback', hold_evidence: 'needs evidence' };
export const EFFECT_TONE: Record<Effect, 'block' | 'hold'> = { block: 'block', hold_callback: 'hold', hold_evidence: 'hold' };

export const STATUS_LABEL: Record<OutcomeStatus, string> = {
  answered: 'answered', unavailable: 'no answer', wrong_entity: 'wrong entity', unreadable: 'unreadable', conflict: 'sources disagree', unbound: 'not bound to entity',
};
export const statusTone = (s: OutcomeStatus): 'clear' | 'hold' | 'block' | '' => (s === 'answered' ? 'clear' : s === 'wrong_entity' || s === 'conflict' ? 'block' : 'hold');

export const CHECK_LABEL: Record<string, string> = {
  registry: 'Company registry', sanctions: 'Sanctions screen', vat: 'Tax number', identity: 'Company identity', mail: 'Mail domain', document: 'Document authenticity', vessel: 'Vessel position',
};
export const ROLE_LABEL: Record<string, string> = {
  seller: 'seller', payee: 'new payee', consignee: 'new consignee', pickup_party: 'new pickup agent', sender_domain: 'sender domain', vessel: 'vessel', document: 'document',
};
export const checkTitle = (id: string) => {
  const [check, role] = id.split(':');
  return `${CHECK_LABEL[check ?? ''] ?? check} · ${ROLE_LABEL[role ?? ''] ?? role}`;
};

export const CATEGORY_LABEL: Record<string, string> = {
  on_record: 'On the record', settle_as_agreed: 'Settle as agreed', bank_change_confirmed: 'Bank change, confirmed', pickup_change_confirmed: 'Pickup agent, confirmed',
  bank_change_unconfirmed: 'Bank change, awaiting callback', document_update: 'Revised document', consignee_change_confirmed: 'Consignee change, confirmed',
  lookalike_domain: 'Look-alike domain', display_name_spoof: 'Display-name spoof', reply_to_diversion: 'Reply-To diversion', compromised_mailbox: 'Compromised mailbox',
  payee_not_seller: 'Payee is not the seller', sanctioned_party: 'Sanctioned party', sanctioned_vessel: 'Sanctioned vessel', unrelated_domain: 'Unrelated domain',
  forged_document: 'Forged document', steered_callback: 'Steered callback',
};
export const RELATION_LABEL: Record<string, string> = {
  same: 'trusted domain', subdomain: 'trusted subdomain', lookalike: 'look-alike', brand_in_other_domain: 'brand on another domain', free_mail: 'free mail', unrelated: 'unrelated domain',
};
export const SOLANA_TX = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
