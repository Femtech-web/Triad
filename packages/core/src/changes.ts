import { compareDomains } from './domains.js';
import type { DomainComparison } from './domains.js';
import { domainOf } from './model.js';
import type { Instruction, Party, Payout, Shipment, TradeDocument, Vessel } from './model.js';
import { compareNames } from './names.js';
import type { NameRelation } from './names.js';

// What an instruction changes, compared with the trusted record. Destination changes (where money or cargo goes) are
// the ones that need all three witnesses.

export interface SenderAnalysis {
  from: string;
  domain: DomainComparison | null;
  // The sender is one of the record's authorized contacts, by exact address.
  authorizedContactId: string | null;
  // A display name that copies an authorized contact while the address is someone else's.
  displayNameImpersonates: string | null;
  replyTo: { address: string; domain: DomainComparison | null } | null;
}

export type Change =
  | { kind: 'payout'; before: Payout; after: Payout; holderVsSeller: NameRelation }
  | { kind: 'consignee'; before: Party; after: Party }
  | { kind: 'pickup_party'; before: Party | null; after: Party }
  | { kind: 'vessel'; before: Vessel; after: Vessel }
  | { kind: 'document'; document: TradeDocument; replaces: TradeDocument | null };

export interface ChangeSet { sender: SenderAnalysis; changes: Change[]; destinationChanged: boolean }

function samePayout(a: Payout, b: Payout): boolean {
  return a.rail === b.rail && a.address === b.address && a.holderName === b.holderName && (a.bankRef ?? '') === (b.bankRef ?? '');
}

function sameParty(a: Party, b: Party): boolean {
  return a.id === b.id && compareNames(a.legalName, b.legalName) === 'same' && a.country === b.country;
}

export function analyzeSender(shipment: Shipment, instruction: Instruction): SenderAnalysis {
  const { from, displayName, replyTo } = instruction.channel;
  const trusted = shipment.seller.domain;
  const authorized = shipment.seller.contacts.filter((c) => shipment.authorizedContactIds.includes(c.id));
  const exact = authorized.find((c) => c.email === from) ?? null;
  const copiedName = !exact ? authorized.find((c) => displayName.trim() && compareNames(c.name, displayName) !== 'different') ?? null : null;
  const fromDomain = domainOf(from);
  return {
    from,
    domain: trusted ? compareDomains(fromDomain, trusted) : null,
    authorizedContactId: exact?.id ?? null,
    displayNameImpersonates: copiedName?.id ?? null,
    replyTo: replyTo && domainOf(replyTo) !== fromDomain ? { address: replyTo, domain: trusted ? compareDomains(domainOf(replyTo), trusted) : null } : null,
  };
}

export function detectChanges(shipment: Shipment, instruction: Instruction): ChangeSet {
  const changes: Change[] = [];
  const { payout, consignee, pickupParty, vessel, documents } = instruction.changes;
  if (payout && !samePayout(payout, shipment.payout)) {
    changes.push({ kind: 'payout', before: shipment.payout, after: payout, holderVsSeller: compareNames(payout.holderName, shipment.seller.legalName) });
  }
  if (consignee && !sameParty(consignee, shipment.consignee)) changes.push({ kind: 'consignee', before: shipment.consignee, after: consignee });
  if (pickupParty && !(shipment.pickupParty && sameParty(pickupParty, shipment.pickupParty))) changes.push({ kind: 'pickup_party', before: shipment.pickupParty ?? null, after: pickupParty });
  if (vessel && vessel.imo !== shipment.vessel.imo) changes.push({ kind: 'vessel', before: shipment.vessel, after: vessel });
  for (const document of documents ?? []) {
    if (shipment.documents.some((d) => d.sha256 === document.sha256)) continue;
    changes.push({ kind: 'document', document, replaces: shipment.documents.find((d) => d.kind === document.kind) ?? null });
  }
  return { sender: analyzeSender(shipment, instruction), changes, destinationChanged: changes.some((c) => c.kind !== 'document') };
}
