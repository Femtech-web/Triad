import { compareNames } from '@triad/core';
import type { CheckKind, CheckRequest, SourceAnswer } from '@triad/core';
import type { Delivery } from './telegraph/client.js';

// Turns one delivered Telegraph answer into a source answer for one check. Only fields Telegraph marked `ok` are read,
// a missing key field is `unreadable`, and an answer that names a different entity is `wrong_entity`.

// The field each check's decision rests on; sources are compared on it.
export const KEY_FIELD: Record<CheckKind, string> = {
  registry: 'active', sanctions: 'matched', vat: 'valid', identity: 'domain', mail: 'lookup_ok', document: 'verdict', vessel: 'latitude',
};

const asBool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const asNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const asList = (v: unknown): string | null => (Array.isArray(v) && v.length ? v.map(String).join(', ') : asString(v));
const normalizeId = (id: string) => id.toUpperCase().replace(/[^A-Z0-9]/g, '');

function subjectName(check: CheckRequest): string {
  const s = check.subject;
  return s.kind === 'entity' || s.kind === 'vessel' ? s.name : s.kind === 'domain' ? s.domain : s.reference;
}

export function interpret(check: CheckRequest, delivery: Delivery): SourceAnswer {
  const { body, purchase } = delivery;
  const name = delivery.minerName ?? `Miner ${purchase.minerId ?? 'unknown'}`;
  const source = (status: SourceAnswer['status'], fields: Record<string, unknown>, detail: string): SourceAnswer => ({ kind: 'telegraph', name, status, fields, detail, purchase });
  const result = body.result;
  if (body.result_shape !== 'intent' || !result) return source('unreadable', {}, `${name} returned no canonical fields${body.shape_error ? ` (${body.shape_error})` : ''}.`);
  const status = body.field_status ?? {};
  const read = (key: string): unknown => (status[key] === undefined || status[key] === 'ok' ? result[key] : null);
  const asked = subjectName(check);

  switch (check.check) {
    case 'registry': {
      const active = asBool(read('active'));
      const legalName = asString(read('legal_name'));
      const registrationId = asString(read('registration_id'));
      const fields = { active, legal_name: legalName, registration_id: registrationId };
      if (active === null) return source('unreadable', fields, `${name} did not say whether ${asked} is active.`);
      const wantedId = check.subject.kind === 'entity' ? check.subject.registrationId : undefined;
      if (legalName && compareNames(legalName, asked) === 'different') return source('wrong_entity', fields, `${name} answered about ${legalName}, not ${asked}.`);
      if (registrationId && wantedId && normalizeId(registrationId) !== normalizeId(wantedId)) return source('wrong_entity', fields, `${name} answered about registration ${registrationId}, not ${wantedId}.`);
      if (!legalName && !registrationId) return source('unbound', fields, `${name} said "${active ? 'active' : 'inactive'}" without naming the company or its registration.`);
      return source('answered', fields, `${name}: ${legalName ?? asked} is ${active ? 'active' : 'not active'}${registrationId ? ` (${registrationId})` : ''}.`);
    }
    case 'sanctions': {
      const matched = asBool(read('matched'));
      const echoed = asString(read('name'));
      const fields = { matched, lists: asList(read('lists')), matches: asList(read('matches')) };
      if (matched === null) return source('unreadable', fields, `${name} did not say whether ${asked} matched.`);
      if (echoed && compareNames(echoed, asked) === 'different') return source('wrong_entity', fields, `${name} screened ${echoed}, not ${asked}.`);
      return source('answered', fields, `${name}: ${matched ? 'match' : 'no match'} for ${asked}${fields.lists ? ` on ${fields.lists}` : ''}.`);
    }
    case 'vat': {
      const valid = asBool(read('valid'));
      const registered = asString(read('registered_name'));
      const fields = { valid, registered_name: registered };
      if (valid === null) return source('unreadable', fields, `${name} did not say whether ${check.params.vat_number} is valid.`);
      if (registered && compareNames(registered, asked) === 'different') return source('wrong_entity', fields, `${name} says ${check.params.vat_number} belongs to ${registered}, not ${asked}.`);
      if (!registered) return source('unbound', fields, `${name} said the number is ${valid ? 'valid' : 'invalid'} without naming its holder.`);
      return source('answered', fields, `${name}: ${check.params.vat_number} is ${valid ? 'valid' : 'invalid'} for ${registered}.`);
    }
    case 'identity': {
      const domain = asString(read('domain'));
      const company = asString(read('company'));
      const fields = { domain, company, headquarters: asString(read('headquarters')) };
      if (!domain) return source('unreadable', fields, `${name} gave no domain for ${asked}.`);
      if (company && compareNames(company, asked) === 'different') return source('wrong_entity', fields, `${name} described ${company}, not ${asked}.`);
      return source('answered', fields, `${name}: ${asked}'s domain is ${domain}.`);
    }
    case 'mail': {
      const ok = asBool(read('lookup_ok'));
      return ok === null ? source('unreadable', {}, `${name} did not say whether ${asked} has mail records.`)
        : source('answered', { lookup_ok: ok }, `${name}: ${asked} ${ok ? 'has' : 'has no'} ${check.params.record_type} records.`);
    }
    case 'document': {
      const verdict = asString(read('verdict'));
      const evidence = Array.isArray(result.evidence) ? result.evidence.map(String).slice(0, 5) : [];
      const fields = { verdict, authentic: asBool(read('authentic')), evidence };
      return verdict ? source('answered', fields, `${name}: ${verdict}.`) : source('unreadable', fields, `${name} gave no verdict on ${asked}.`);
    }
    case 'vessel': {
      const fields = { latitude: asNumber(read('latitude')), longitude: asNumber(read('longitude')), speed_knots: asNumber(read('speed_knots')), observed_at: asString(read('observed_at')) };
      return fields.latitude === null || fields.longitude === null
        ? source('unreadable', fields, `${name} returned no position for ${asked}.`)
        : source('answered', fields, `${name}: ${asked} at ${fields.latitude}, ${fields.longitude}${fields.observed_at ? ` (${fields.observed_at})` : ''}.`);
    }
  }
}
