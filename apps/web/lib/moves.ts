import type { Instruction, Shipment } from '@triad/core';

// One-click versions of the tricks the benchmark's attacks use, applied to whatever case is open. Each returns a new
// instruction; the person can keep editing from there.

export interface Move { id: string; label: string; hint: string; apply: (shipment: Shipment, draft: Instruction) => Instruction }

const ATTACKER_EVM = '0x9999999999999999999999999999999999999999';
const ATTACKER_SOLANA = 'AtTacker1111111111111111111111111111111111';

function lookalike(domain: string): string {
  const [first = '', ...rest] = domain.split('.');
  return [first.length > 4 ? first.slice(0, -1) : `${first}${first.at(-1) ?? ''}`, ...rest].join('.');
}
const trustedContact = (s: Shipment) => s.seller.contacts.find((c) => s.authorizedContactIds.includes(c.id) && c.phone) ?? s.seller.contacts.find((c) => s.authorizedContactIds.includes(c.id))!;
const localPart = (email: string) => email.slice(0, email.indexOf('@'));
const brand = (s: Shipment) => (s.seller.domain ?? 'seller.com').split('.')[0]!;
const shortName = (s: Shipment) => s.seller.legalName.split(/\s+/)[0]!.replace(/^./, (c) => c.toUpperCase()).replace(/(?<=.)[A-Z]+/, (m) => m.toLowerCase());

export const MOVES: Move[] = [
  {
    id: 'genuine', label: 'Genuine mailbox', hint: 'Send from the trusted contact’s real address, as a compromised mailbox would',
    apply: (s, d) => { const c = trustedContact(s); return { ...d, channel: { kind: 'email', from: c.email, displayName: c.name } }; },
  },
  {
    id: 'lookalike', label: 'Look-alike domain', hint: 'Drop one letter from the seller’s domain',
    apply: (s, d) => { const c = trustedContact(s); return { ...d, channel: { kind: 'email', from: `${localPart(c.email)}@${lookalike(s.seller.domain ?? 'seller.com')}`, displayName: c.name } }; },
  },
  {
    id: 'freemail', label: 'Free mail, copied name', hint: 'A Gmail address wearing the trusted contact’s display name',
    apply: (s, d) => { const c = trustedContact(s); return { ...d, channel: { kind: 'email', from: `${brand(s)}.${localPart(c.email).replace(/\W/g, '')}@gmail.com`, displayName: c.name } }; },
  },
  {
    id: 'replyto', label: 'Reply-To diversion', hint: 'Genuine sender, but replies go to a look-alike finance domain',
    apply: (s, d) => { const c = trustedContact(s); return { ...d, channel: { kind: 'email', from: c.email, displayName: c.name, replyTo: `${localPart(c.email)}@${brand(s)}-finance.com` } }; },
  },
  {
    id: 'payee', label: 'Pay another company', hint: 'An “affiliate” holds the new account',
    apply: (s, d) => ({ ...d, summary: `For tax reasons ${s.reference} will be invoiced by our trading affiliate. Please pay the account below.`,
      changes: { ...d.changes, payout: { holderName: `${shortName(s)} Metals Trading DMCC`, rail: s.payout.rail, address: s.payout.rail === 'sepolia' ? ATTACKER_EVM : ATTACKER_SOLANA, bankRef: 'NEW-ACCOUNT' } } }),
  },
  {
    id: 'sanctioned-agent', label: 'Sanctioned pickup agent', hint: 'Release the cargo to PAO Sovcomflot (OFAC SDN 34741)',
    apply: (s, d) => ({ ...d, summary: `Please release ${s.reference} at the discharge port to our new pickup agent below.`,
      changes: { ...d.changes, pickupParty: { id: 'pickup-new', legalName: 'PAO Sovcomflot', country: 'RU', contacts: [] } } }),
  },
  {
    id: 'sanctioned-vessel', label: 'Sanctioned tanker', hint: 'Swap in NS Antarctic, IMO9413559',
    apply: (s, d) => ({ ...d, summary: `Owing to a scheduling change, ${s.reference} will load on the substitute vessel below.`,
      changes: { ...d.changes, vessel: { name: 'NS Antarctic', imo: 'IMO9413559' } } }),
  },
];
