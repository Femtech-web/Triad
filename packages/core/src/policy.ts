import type { ChangeSet } from './changes.js';
import type { CheckRequest } from './checks.js';
import type { Instruction, Payout, Shipment } from './model.js';

export const POLICY_VERSION = 'triad-release-v1';

// A rule's effect decides what can resolve it: nothing (block), the previously trusted contact (callback), or
// better evidence (evidence). A trusted contact's confirmation never stands in for a failed or missing check.
export type Effect = 'block' | 'hold_callback' | 'hold_evidence';

export const RULES = {
  'R-SENDER-LOOKALIKE': 'The sender domain imitates the trusted domain',
  'R-DISPLAY-NAME-SPOOF': 'The display name copies a trusted contact from an address outside the trusted domain',
  'R-REPLY-TO-LOOKALIKE': 'Replies are diverted to a domain imitating the trusted domain',
  'R-SANCTIONS-MATCH': 'A party the change involves matches a sanctions list',
  'R-ENTITY-INACTIVE': 'A party the change involves is not an active registered company',
  'R-DOCUMENT-FORGED': 'A document the change relies on is judged forged',
  'R-CALLBACK-DENIED': 'The previously trusted contact denied the change',
  'R-PAYOUT-CHANGED': 'Payment would go to a different account',
  'R-PAYEE-NOT-SELLER': 'The new account holder is not the seller',
  'R-CARGO-PARTY-CHANGED': 'Cargo would be released to a different party',
  'R-VESSEL-CHANGED': 'Cargo would move on a different vessel',
  'R-SENDER-NOT-AUTHORIZED': 'The instruction did not come from an authorized contact',
  'R-SENDER-OUTSIDE-DOMAIN': 'The instruction came from outside the trusted domain',
  'R-REPLY-TO-DIVERTED': 'Replies are diverted to a different domain',
  'R-PAYOUT-RAIL-MISMATCH': 'The new account is on a different settlement rail',
  'R-VAT-INVALID': 'A tax number does not validate for the party',
  'R-DOCUMENT-DOUBTFUL': 'A document the change relies on is judged likely forged',
  'R-SENDER-DOMAIN-NO-MAIL': 'The sender domain has no mail records',
  'R-RECORD-DOMAIN-DIFFERS': 'Sources give the seller a different web domain from the record',
  'R-WRONG-ENTITY': 'An answer was about a different entity from the one asked about',
  'R-SOURCES-DISAGREE': 'Independent sources disagree on a check the release depends on',
  'R-EVIDENCE-MISSING': 'A required check could not be completed',
  'R-NO-OUT-OF-BAND-CHANNEL': 'The trusted contact cannot be reached outside the channel the instruction used',
} as const;
export type RuleId = keyof typeof RULES;

export interface RuleHit { rule: RuleId; effect: Effect; text: string; checkId?: string }

// `conflict`: independent sources disagree. `unbound`: the answer never named the entity, so it can't be tied to it.
export type OutcomeStatus = 'answered' | 'unavailable' | 'wrong_entity' | 'unreadable' | 'conflict' | 'unbound';
export interface Purchase {
  rail: 'sepolia-escrow' | 'solana-x402' | 'base-sepolia-x402';
  receiptHash: string | null;
  signalHash: string | null;
  amountUusdc: string;
  minerId: string | null;
  latencyMs: number;
  // The on-chain payment, when the rail settles per call (x402); escrow calls settle per epoch.
  settlementTx?: string;
}
// One answer to a check: a Telegraph Miner's (paid, with a receipt) or an official list's (free, with its snapshot hash).
export interface SourceAnswer {
  kind: 'telegraph' | 'official';
  name: string;
  status: OutcomeStatus;
  fields: Record<string, unknown>;
  detail: string;
  purchase: Purchase | null;
  snapshot?: { url: string; sha256: string; retrievedAt: string };
}

// The answers to one check, reduced to the fields the policy reads. `fields` holds only what the sources agree on.
export interface CheckOutcome {
  checkId: string;
  status: OutcomeStatus;
  fields: Record<string, unknown>;
  detail: string;
  sources: SourceAnswer[];
}

export interface CallbackTarget { contactId: string; name: string; channel: 'phone' | 'email'; address: string }
export interface CallbackResult { contactId: string; channel: 'phone' | 'email'; outcome: 'confirmed' | 'denied'; respondedAt: string }

export interface Decision {
  policy: typeof POLICY_VERSION;
  decision: 'CLEAR' | 'HOLD' | 'BLOCK';
  needs: ('callback' | 'evidence')[];
  hits: RuleHit[];
  facts: string[];
  warnings: string[];
  unknowns: string[];
  callback: { target: CallbackTarget | null; result: CallbackResult | null; accepted: boolean };
}

// The previously trusted contact, reached out of band. A phone number on the record beats any mailbox, since the whole
// mail domain may be compromised; email is used only when it is not the mailbox the instruction came from.
export function callbackTarget(shipment: Shipment, instruction: Instruction): CallbackTarget | null {
  const authorized = shipment.authorizedContactIds.flatMap((id) => shipment.seller.contacts.filter((c) => c.id === id));
  const byPhone = authorized.find((c) => c.phone);
  if (byPhone) return { contactId: byPhone.id, name: byPhone.name, channel: 'phone', address: byPhone.phone! };
  const byEmail = authorized.find((c) => c.email !== instruction.channel.from);
  return byEmail ? { contactId: byEmail.id, name: byEmail.name, channel: 'email', address: byEmail.email } : null;
}

const account = (p: Payout) => (p.bankRef ? `account ${p.bankRef}` : p.address);
const field = <T>(o: CheckOutcome, key: string, guard: (v: unknown) => v is T): T | null => (guard(o.fields[key]) ? o.fields[key] : null);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function senderRules(changeSet: ChangeSet): RuleHit[] {
  const { sender } = changeSet;
  const hits: RuleHit[] = [];
  const relation = sender.domain?.relation;
  const outside = relation !== undefined && relation !== 'same' && relation !== 'subdomain';
  if (relation === 'lookalike' || relation === 'brand_in_other_domain') hits.push({ rule: 'R-SENDER-LOOKALIKE', effect: 'block', text: sender.domain!.reason });
  else if (outside) hits.push({ rule: 'R-SENDER-OUTSIDE-DOMAIN', effect: 'hold_callback', text: sender.domain!.reason });
  else if (!sender.authorizedContactId) hits.push({ rule: 'R-SENDER-NOT-AUTHORIZED', effect: 'hold_callback', text: `${sender.from} is not an authorized contact for this shipment` });
  if (sender.displayNameImpersonates && outside) hits.push({ rule: 'R-DISPLAY-NAME-SPOOF', effect: 'block', text: `The display name copies an authorized contact, but the address is ${sender.from}` });
  if (sender.replyTo) {
    const replyRelation = sender.replyTo.domain?.relation;
    if (replyRelation === 'lookalike' || replyRelation === 'brand_in_other_domain') hits.push({ rule: 'R-REPLY-TO-LOOKALIKE', effect: 'block', text: `Replies go to ${sender.replyTo.address}: ${sender.replyTo.domain!.reason}` });
    else if (replyRelation !== 'same' && replyRelation !== 'subdomain') hits.push({ rule: 'R-REPLY-TO-DIVERTED', effect: 'hold_callback', text: `Replies go to ${sender.replyTo.address}, not the sending domain` });
  }
  return hits;
}

function changeRules(shipment: Shipment, changeSet: ChangeSet): RuleHit[] {
  return changeSet.changes.flatMap((change): RuleHit[] => {
    if (change.kind === 'payout') {
      return [
        { rule: 'R-PAYOUT-CHANGED', effect: 'hold_callback', text: `Payment would move from ${account(change.before)} to ${account(change.after)}` },
        ...(change.holderVsSeller === 'different' ? [{ rule: 'R-PAYEE-NOT-SELLER' as const, effect: 'hold_callback' as const, text: `The new account is held by ${change.after.holderName}, not ${shipment.seller.legalName}` }] : []),
        ...(change.after.rail !== shipment.releaseOfficer.rail ? [{ rule: 'R-PAYOUT-RAIL-MISMATCH' as const, effect: 'hold_evidence' as const, text: `The new account is on ${change.after.rail}; this shipment settles on ${shipment.releaseOfficer.rail}` }] : []),
      ];
    }
    if (change.kind === 'vessel') {
      return [{ rule: 'R-VESSEL-CHANGED', effect: 'hold_callback', text: `The cargo would move on ${change.after.name} (${change.after.imo})${change.before ? ` instead of ${change.before.name} (${change.before.imo})` : ''}` }];
    }
    if (change.kind === 'consignee' || change.kind === 'pickup_party') {
      const what = change.kind === 'consignee' ? 'consignee' : 'pickup party';
      return [{ rule: 'R-CARGO-PARTY-CHANGED', effect: 'hold_callback', text: `The ${what} would change${change.before ? ` from ${change.before.legalName}` : ''} to ${change.after.legalName}` }];
    }
    return [];
  });
}

// Each check's answer becomes facts, warnings or unknowns. A required check without a usable answer is an unknown that
// keeps the release on hold, whatever else is true.
function evidenceRules(plan: CheckRequest[], outcomes: CheckOutcome[], facts: string[], unknowns: string[], trustedDomain: string | undefined): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const check of plan) {
    const outcome = outcomes.find((o) => o.checkId === check.id);
    const who = check.subject.kind === 'entity' ? check.subject.name : check.subject.kind === 'domain' ? check.subject.domain : check.subject.kind === 'vessel' ? check.subject.imo : check.subject.reference;
    const missing = (why: string) => {
      unknowns.push(`${check.purpose} ${why}`);
      if (check.required) hits.push({ rule: 'R-EVIDENCE-MISSING', effect: 'hold_evidence', text: `${check.purpose} ${why}`, checkId: check.id });
    };
    if (!outcome) { missing('No answer was bought.'); continue; }
    if (outcome.status === 'conflict') {
      if (check.required) hits.push({ rule: 'R-SOURCES-DISAGREE', effect: 'hold_evidence', text: outcome.detail, checkId: check.id });
      unknowns.push(`${check.purpose} Sources disagree: ${outcome.detail}`);
      continue;
    }
    if (outcome.status === 'wrong_entity') {
      // Never evidence. On a required check it also holds the release; on an optional one it is only an unknown.
      if (check.required) hits.push({ rule: 'R-WRONG-ENTITY', effect: 'hold_evidence', text: outcome.detail, checkId: check.id });
      unknowns.push(`${check.purpose} The answer was about a different entity: ${outcome.detail}`);
      continue;
    }
    if (outcome.status !== 'answered') { missing(outcome.detail); continue; }

    if (check.check === 'sanctions') {
      const matched = field(outcome, 'matched', isBool);
      if (matched === true) hits.push({ rule: 'R-SANCTIONS-MATCH', effect: 'block', text: `${who} matches a sanctions list entry${isString(outcome.fields.lists) ? ` (${outcome.fields.lists})` : ''}`, checkId: check.id });
      else if (matched === false) facts.push(`No sanctions match for ${who}.`);
      else missing('The answer did not say whether there was a match.');
    }
    if (check.check === 'registry') {
      const active = field(outcome, 'active', isBool);
      const id = field(outcome, 'registration_id', isString);
      if (active === false) hits.push({ rule: 'R-ENTITY-INACTIVE', effect: 'block', text: `${who} is not active in the registry${id ? ` (${id})` : ''}`, checkId: check.id });
      else if (active === true) facts.push(`${who} is an active registered company${id ? ` (${id})` : ''}.`);
      else missing('The answer did not say whether the company is active.');
    }
    if (check.check === 'vat') {
      const valid = field(outcome, 'valid', isBool);
      if (valid === false) hits.push({ rule: 'R-VAT-INVALID', effect: 'hold_evidence', text: `${check.params.vat_number} does not validate for ${who}`, checkId: check.id });
      else if (valid === true) facts.push(`${check.params.vat_number} is a valid tax number for ${who}.`);
      else missing('The answer did not say whether the number is valid.');
    }
    if (check.check === 'document') {
      const verdict = field(outcome, 'verdict', isString);
      if (verdict === 'Forged') hits.push({ rule: 'R-DOCUMENT-FORGED', effect: 'block', text: `${who} is judged forged`, checkId: check.id });
      else if (verdict === 'Likely forged') hits.push({ rule: 'R-DOCUMENT-DOUBTFUL', effect: 'hold_evidence', text: `${who} is judged likely forged`, checkId: check.id });
      else if (verdict) facts.push(`${who}: document check says "${verdict}".`);
      else missing('The answer gave no verdict.');
    }
    if (check.check === 'mail') {
      const ok = field(outcome, 'lookup_ok', isBool);
      if (ok === false) hits.push({ rule: 'R-SENDER-DOMAIN-NO-MAIL', effect: 'hold_evidence', text: `${who} has no mail (MX) records, yet the instruction came from it`, checkId: check.id });
      else if (ok === true) facts.push(`${who} has mail records.`);
    }
    if (check.check === 'identity') {
      const found = field(outcome, 'domain', isString)?.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      if (found && trustedDomain && found !== trustedDomain) hits.push({ rule: 'R-RECORD-DOMAIN-DIFFERS', effect: 'hold_evidence', text: `Sources give ${found} as ${who}'s domain; the record has ${trustedDomain}`, checkId: check.id });
      else if (found) facts.push(`Sources confirm ${found} as ${who}'s domain.`);
    }
    if (check.check === 'vessel') {
      const lat = outcome.fields.latitude;
      const lon = outcome.fields.longitude;
      const at = outcome.fields.observed_at;
      if (typeof lat === 'number' && typeof lon === 'number') facts.push(`${who} was at ${lat.toFixed(3)}, ${lon.toFixed(3)}${isString(at) ? ` (${at})` : ''}.`);
    }
  }
  return hits;
}

export interface DecisionInput {
  shipment: Shipment;
  instruction: Instruction;
  changeSet: ChangeSet;
  plan: CheckRequest[];
  outcomes: CheckOutcome[];
  callback?: CallbackResult;
}

export function decide({ shipment, instruction, changeSet, plan, outcomes, callback }: DecisionInput): Decision {
  const facts: string[] = [];
  const unknowns: string[] = [];
  const hits = [...senderRules(changeSet), ...changeRules(shipment, changeSet), ...evidenceRules(plan, outcomes, facts, unknowns, shipment.seller.domain)];
  const needsCallback = hits.some((h) => h.effect === 'hold_callback');
  const target = needsCallback ? callbackTarget(shipment, instruction) : null;
  if (needsCallback && !target) hits.push({ rule: 'R-NO-OUT-OF-BAND-CHANNEL', effect: 'hold_evidence', text: 'The only authorized contact is the sender, and the record has no phone number for them' });

  // A callback counts only if it reached the contact and channel Triad chose.
  const accepted = Boolean(callback && target && callback.contactId === target.contactId && callback.channel === target.channel);
  if (callback && accepted && callback.outcome === 'denied') hits.push({ rule: 'R-CALLBACK-DENIED', effect: 'block', text: `${target!.name} denied the change by ${callback.channel}` });
  if (callback && accepted && callback.outcome === 'confirmed') facts.push(`${target!.name} confirmed the change by ${callback.channel} (${callback.respondedAt}).`);
  if (callback && !accepted) unknowns.push('A callback was recorded, but not to the trusted contact and channel this decision requires, so it was ignored.');

  const confirmed = accepted && callback!.outcome === 'confirmed';
  const blocked = hits.some((h) => h.effect === 'block');
  const evidenceOpen = hits.some((h) => h.effect === 'hold_evidence');
  const callbackOpen = needsCallback && !confirmed;
  const needs: Decision['needs'] = blocked ? [] : [...(callbackOpen ? ['callback' as const] : []), ...(evidenceOpen ? ['evidence' as const] : [])];
  return {
    policy: POLICY_VERSION,
    decision: blocked ? 'BLOCK' : needs.length ? 'HOLD' : 'CLEAR',
    needs,
    hits,
    facts,
    warnings: hits.map((h) => h.text),
    unknowns,
    callback: { target, result: callback ?? null, accepted },
  };
}
