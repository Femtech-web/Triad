import type { ChangeSet } from './changes.js';
import { registrableDomain } from './domains.js';
import type { Party, Shipment } from './model.js';

// Which Telegraph checks a change makes relevant. Only changed facts are checked, so cost follows risk.
// A required check that cannot be completed keeps the release on hold; an optional one only adds evidence.

export const INTENTS = {
  registry: 'CORPORATE_REGISTRY_LOOKUP_GENERAL',
  sanctions: 'SANCTIONS_SCREENING_MATCH_GENERAL',
  vat: 'VENDOR_VERIFY_GENERAL',
  identity: 'B2B_IDENTITY_ENRICHMENT_GENERAL',
  mail: 'EMAIL_SECURITY_GENERAL',
  document: 'DOCUMENT_AUTHENTICITY_GENERAL',
  vessel: 'VESSEL_TELEMETRY_VERIFY_GENERAL',
} as const;
export type CheckKind = keyof typeof INTENTS;

export type Role = 'seller' | 'payee' | 'consignee' | 'pickup_party' | 'sender_domain' | 'vessel' | 'document';
export type Subject =
  | { kind: 'entity'; name: string; country: string; registrationId?: string; vatNumber?: string }
  | { kind: 'domain'; domain: string }
  | { kind: 'vessel'; name: string; imo: string }
  | { kind: 'document'; reference: string; sha256: string };

export interface CheckRequest {
  id: string;
  check: CheckKind;
  intent: typeof INTENTS[CheckKind];
  params: Record<string, string>;
  role: Role;
  subject: Subject;
  required: boolean;
  purpose: string;
}

// Registries are asked with the country's name; the record stores ISO codes.
const COUNTRY_NAMES: Record<string, string> = {
  AE: 'United Arab Emirates', AU: 'Australia', BR: 'Brazil', CA: 'Canada', CH: 'Switzerland', CN: 'China', DE: 'Germany', FR: 'France',
  GB: 'United Kingdom', HK: 'Hong Kong', IN: 'India', IT: 'Italy', JP: 'Japan', KR: 'South Korea', MY: 'Malaysia', NL: 'Netherlands',
  NO: 'Norway', SA: 'Saudi Arabia', SG: 'Singapore', TR: 'Turkey', US: 'United States', ZA: 'South Africa', CL: 'Chile', PE: 'Peru',
};
export const countryName = (code: string): string => COUNTRY_NAMES[code] ?? code;

function entity(party: Pick<Party, 'legalName' | 'country' | 'registrationId' | 'vatNumber'>): Subject {
  return { kind: 'entity', name: party.legalName, country: party.country,
    ...(party.registrationId ? { registrationId: party.registrationId } : {}), ...(party.vatNumber ? { vatNumber: party.vatNumber } : {}) };
}

function request(check: CheckKind, role: Role, subject: Subject, params: Record<string, string>, required: boolean, purpose: string): CheckRequest {
  return { id: `${check}:${role}`, check, intent: INTENTS[check], params, role, subject, required, purpose };
}

function partyChecks(role: Role, party: Pick<Party, 'legalName' | 'country' | 'registrationId' | 'vatNumber'>, why: string): CheckRequest[] {
  const subject = entity(party);
  return [
    // Asked by name, which every registry Miner understands; the identifier still binds the answer to the right company.
    request('registry', role, subject, { company: party.legalName, jurisdiction: countryName(party.country) }, true, `${why}: is ${party.legalName} a registered, active company?`),
    request('sanctions', role, subject, { name: party.legalName }, true, `${why}: is ${party.legalName} on a sanctions list?`),
    ...(party.vatNumber ? [request('vat', role, subject, { vendor: party.legalName, vat_number: party.vatNumber }, false, `${why}: is ${party.vatNumber} a valid tax number for ${party.legalName}?`)] : []),
  ];
}

export function planChecks(shipment: Shipment, changeSet: ChangeSet): CheckRequest[] {
  const plan: CheckRequest[] = [];
  for (const change of changeSet.changes) {
    if (change.kind === 'payout') {
      plan.push(...partyChecks('seller', shipment.seller, 'Payment details changed'));
      if (change.holderVsSeller === 'different') {
        plan.push(...partyChecks('payee', { legalName: change.after.holderName, country: shipment.seller.country }, 'The new account holder is not the seller'));
      }
    }
    if (change.kind === 'consignee') plan.push(...partyChecks('consignee', change.after, 'Consignee changed'));
    if (change.kind === 'pickup_party') plan.push(...partyChecks('pickup_party', change.after, 'Pickup party changed'));
    if (change.kind === 'document' && change.document.content) {
      plan.push(request('document', 'document', { kind: 'document', reference: change.document.reference, sha256: change.document.sha256 },
        { document: change.document.content }, false, `Is the new ${change.document.kind.replace(/_/g, ' ')} ${change.document.reference} authentic?`));
    }
  }
  const relation = changeSet.sender.domain?.relation;
  if (relation && relation !== 'same' && relation !== 'subdomain') {
    const senderDomain = registrableDomain(changeSet.sender.from.slice(changeSet.sender.from.lastIndexOf('@') + 1));
    plan.push(request('identity', 'seller', entity(shipment.seller), { company: shipment.seller.legalName }, false, `What web domain do sources give for ${shipment.seller.legalName}?`));
    plan.push(request('mail', 'sender_domain', { kind: 'domain', domain: senderDomain }, { domain: senderDomain, record_type: 'MX' }, false, `Does ${senderDomain} receive mail at all?`));
  }
  if (changeSet.destinationChanged) {
    // The vessel that would actually carry the cargo: the substitute if the instruction names one.
    const carrier = changeSet.changes.find((c) => c.kind === 'vessel')?.after ?? shipment.vessel;
    const vessel: Subject = { kind: 'vessel', name: carrier.name, imo: carrier.imo };
    // Sanctioned tankers are listed by name and IMO; the vessel carrying the cargo is screened like a party.
    plan.push(request('sanctions', 'vessel', vessel, { name: carrier.name }, true, `Is the vessel ${carrier.name} (${carrier.imo}) sanctioned?`));
    plan.push(request('vessel', 'vessel', vessel, { vessel: carrier.imo }, false, `Where is ${carrier.name} (${carrier.imo}) now?`));
  }
  return [...new Map(plan.map((c) => [c.id, c])).values()];
}
