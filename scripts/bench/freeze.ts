// Builds Triad's frozen benchmark: 20 legitimate changes and 20 attacks on synthetic shipments between real,
// registered sellers (LEIs from GLEIF) and a synthetic buyer. Sanctioned parties and tankers are OFAC SDN entries.
// Writes benchmark/triad-v1/scenarios.jsonl and a manifest with its SHA-256; refuses to overwrite either.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { instructionSchema, shipmentSchema } from '@triad/core';
import type { Instruction, Party, Shipment } from '@triad/core';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(ROOT, 'benchmark/triad-v1');

type Decision = 'CLEAR' | 'HOLD' | 'BLOCK';
export interface BenchmarkCase {
  name: string;
  kind: 'legitimate' | 'attack';
  category: string;
  expected: Decision;
  // Outcomes that are still safe: an attack held instead of blocked is not released.
  acceptable: Decision[];
  description: string;
  synthetic: string[];
  shipment: Shipment;
  instruction: Instruction;
  callback?: { contactId: string; channel: 'phone' | 'email'; outcome: 'confirmed' | 'denied'; respondedAt: string };
}

// Real sellers, as GLEIF lists them (retrieved 2026-11-25), and their public web domains.
const SELLERS = [
  { key: 'antofagasta', legalName: 'ANTOFAGASTA PLC', country: 'GB', lei: '213800MY6QVH4FVLD628', domain: 'antofagasta.co.uk', short: 'Antofagasta', commodity: 'Copper concentrate', phone: '+442070001001' },
  { key: 'aurubis', legalName: 'Aurubis AG', country: 'DE', lei: '5299005SHIN9ZK7GW242', domain: 'aurubis.com', short: 'Aurubis', commodity: 'Copper cathodes, LME grade A', phone: '+494000001002' },
  { key: 'boliden', legalName: 'BOLIDEN AB', country: 'SE', lei: '21380059QU7IM1ONDJ56', domain: 'boliden.com', short: 'Boliden', commodity: 'Zinc ingots, SHG', phone: '+468000001003' },
  { key: 'freeport', legalName: 'FREEPORT-MCMORAN INC.', country: 'US', lei: '549300IRDTHJQ1PVET45', domain: 'fcx.com', short: 'Freeport-McMoRan', commodity: 'Copper cathodes, COMEX grade 1', phone: '+16020001004' },
  { key: 'glencore', legalName: 'GLENCORE INTERNATIONAL AG', country: 'CH', lei: '213800PSSU2QXF1WLR89', domain: 'glencore.com', short: 'Glencore', commodity: 'Cobalt hydroxide', phone: '+41410001005' },
] as const;
type Seller = typeof SELLERS[number];

// Real logistics and trading counterparties for legitimate changes (GLEIF).
const DSV: Party = { id: 'dsv', legalName: 'DSV A/S', country: 'DK', registrationId: '529900X41C0BSLK67H70', contacts: [] };
const MAERSK: Party = { id: 'maersk', legalName: 'A.P. MØLLER - MÆRSK A/S', country: 'DK', registrationId: '549300D2K6PKKKXVNN73', contacts: [] };
const TRAFIGURA: Party = { id: 'trafigura', legalName: 'TRAFIGURA PTE LTD', country: 'SG', registrationId: '549300Z2X1L1L3MID765', contacts: [] };
// OFAC SDN entries (sdn.csv, retrieved 2026-11-24): 34741, 15117, 25396; tankers 46972 and 46957.
const SANCTIONED: Party[] = [
  { id: 'sdn-sovcomflot', legalName: 'PAO Sovcomflot', country: 'RU', contacts: [] },
  { id: 'sdn-nitc', legalName: 'National Iranian Tanker Company', country: 'IR', contacts: [] },
  { id: 'sdn-irisl', legalName: 'Islamic Republic of Iran Shipping Lines', country: 'IR', contacts: [] },
];
const SANCTIONED_TANKERS = [{ name: 'NS Antarctic', imo: 'IMO9413559' }, { name: 'Anatoly Kolodkin', imo: 'IMO9610808' }];

const BUYER: Party = { id: 'buyer', legalName: 'Halden Metals Trading AG', country: 'CH', domain: 'haldenmetals.ch', contacts: [] };
const OFFICER = { name: 'Halden release desk', rail: 'sepolia' as const, publicKey: '0x152661B3192173Fd6CD7801C8F2241654F8270f4' };
const ATTACKER_WALLET = '0x9999999999999999999999999999999999999999';
const SYNTHETIC = ['shipment', 'buyer', 'seller contacts and mailboxes', 'vessel', 'payout addresses', 'instruction text'];
const RECEIVED = '2026-11-25T09:00:00Z';
const CALLED = '2026-11-25T10:15:00Z';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const wallet = (seed: string) => `0x${sha(`triad-bench:${seed}`).slice(0, 40)}`;

function shipment(s: Seller, n: number): Shipment {
  return shipmentSchema.parse({
    id: `bench-${s.key}-${n}`, reference: `TRD-${s.key.slice(0, 3).toUpperCase()}-${1000 + n}`, commodity: s.commodity, quantity: `${200 + n * 25} t`,
    amount: { value: String(1_000_000 * (n + 1)), currency: 'USDC', decimals: 6 },
    buyer: BUYER,
    seller: { id: 'seller', legalName: s.legalName, country: s.country, registrationId: s.lei, domain: s.domain, contacts: [
      { id: 'treasury', name: `${s.short} Treasury Desk`, email: `treasury.desk@${s.domain}`, phone: s.phone, role: 'Treasury' },
      { id: 'logistics', name: `${s.short} Logistics Desk`, email: `logistics.desk@${s.domain}`, role: 'Logistics' },
    ] },
    consignee: BUYER,
    pickupParty: { id: 'pickup', legalName: 'Rotterdam Bulk Agency BV', country: 'NL', contacts: [] },
    payout: { holderName: s.legalName, rail: 'sepolia', address: wallet(`${s.key}-seller`), bankRef: `${s.country}-TRUSTED-${n}` },
    vessel: { name: 'Pacific Ore', imo: 'IMO9412345' },
    loadPort: 'San Antonio, CL', dischargePort: 'Rotterdam, NL',
    documents: [{ kind: 'bill_of_lading', reference: `BL-${s.key.toUpperCase()}-${n}`, sha256: sha(`bl-${s.key}-${n}`) }],
    authorizedContactIds: ['treasury', 'logistics'],
    releaseOfficer: OFFICER,
  });
}

function instruction(sh: Shipment, n: number, from: string, displayName: string, summary: string, changes: Instruction['changes'], replyTo?: string): Instruction {
  return instructionSchema.parse({ id: `ins-${sh.id}-${n}`, shipmentId: sh.id, receivedAt: RECEIVED, channel: { kind: 'email', from, displayName, ...(replyTo ? { replyTo } : {}) }, summary, changes });
}

const newAccount = (holderName: string, seed: string) => ({ holderName, rail: 'sepolia' as const, address: seed === 'attacker' ? ATTACKER_WALLET : wallet(seed), bankRef: `NEW-${seed.slice(0, 12).toUpperCase()}` });
const confirmed = { contactId: 'treasury', channel: 'phone' as const, outcome: 'confirmed' as const, respondedAt: CALLED };
const cases: BenchmarkCase[] = [];
const add = (c: Omit<BenchmarkCase, 'synthetic'>) => cases.push({ ...c, synthetic: SYNTHETIC });
const treasury = (s: Seller) => ({ from: `treasury.desk@${s.domain}`, name: `${s.short} Treasury Desk` });

// Legitimate changes (20).
SELLERS.forEach((s, i) => {
  const sh = shipment(s, i);
  add({ name: `legit-on-schedule-${s.key}`, kind: 'legitimate', category: 'settle_as_agreed', expected: 'CLEAR', acceptable: ['CLEAR'],
    description: 'Delivery confirmed; payment to the trusted account as agreed.', shipment: sh,
    instruction: instruction(sh, 1, treasury(s).from, treasury(s).name, `Delivery of ${sh.reference} confirmed at Rotterdam. Please settle the invoice as agreed.`, {}) });
});
SELLERS.forEach((s, i) => {
  const sh = shipment(s, 10 + i);
  add({ name: `legit-bank-change-confirmed-${s.key}`, kind: 'legitimate', category: 'bank_change_confirmed', expected: 'CLEAR', acceptable: ['CLEAR'],
    description: 'The seller moved its receiving account; the treasury desk confirmed by phone on the number already on file.', shipment: sh, callback: confirmed,
    instruction: instruction(sh, 1, treasury(s).from, treasury(s).name, `We have moved our USD receiving account to a new bank. Please use the updated details below for ${sh.reference}.`, { payout: newAccount(s.legalName, `${s.key}-new`) }) });
});
[DSV, MAERSK, DSV].forEach((agent, i) => {
  const s = SELLERS[i]!;
  const sh = shipment(s, 20 + i);
  add({ name: `legit-pickup-agent-confirmed-${s.key}`, kind: 'legitimate', category: 'pickup_change_confirmed', expected: 'CLEAR', acceptable: ['CLEAR'],
    description: `A new forwarding agent (${agent.legalName}) collects the cargo; confirmed by phone.`, shipment: sh, callback: confirmed,
    instruction: instruction(sh, 1, `logistics.desk@${s.domain}`, `${s.short} Logistics Desk`, `Please release the cargo at Rotterdam to our new forwarding agent, ${agent.legalName}.`, { pickupParty: agent }) });
});
SELLERS.slice(2, 5).forEach((s, i) => {
  const sh = shipment(s, 30 + i);
  add({ name: `legit-bank-change-awaiting-callback-${s.key}`, kind: 'legitimate', category: 'bank_change_unconfirmed', expected: 'HOLD', acceptable: ['HOLD'],
    description: 'A genuine bank change that has not been confirmed yet: it must wait for the callback, not be blocked.', shipment: sh,
    instruction: instruction(sh, 1, treasury(s).from, treasury(s).name, `Our receiving account has changed following a bank migration. Kindly update your records for ${sh.reference}.`, { payout: newAccount(s.legalName, `${s.key}-migr`) }) });
});
SELLERS.slice(0, 2).forEach((s, i) => {
  const sh = shipment(s, 40 + i);
  add({ name: `legit-revised-invoice-${s.key}`, kind: 'legitimate', category: 'document_update', expected: 'CLEAR', acceptable: ['CLEAR'],
    description: 'A revised commercial invoice (corrected weights); nothing about payment or cargo destination changes.', shipment: sh,
    instruction: instruction(sh, 1, treasury(s).from, treasury(s).name, `Attached is the revised commercial invoice for ${sh.reference} with corrected net weights. Payment details are unchanged.`,
      { documents: [{ kind: 'commercial_invoice', reference: `INV-${sh.reference}-R1`, sha256: sha(`inv-${sh.id}`), content: `COMMERCIAL INVOICE ${sh.reference}-R1. Seller: ${s.legalName}. Buyer: ${BUYER.legalName}. Goods: ${sh.commodity}. Net weight corrected. Payment terms unchanged.` }] }) });
});
[TRAFIGURA, TRAFIGURA].forEach((party, i) => {
  const s = SELLERS[3 + i]!;
  const sh = shipment(s, 50 + i);
  add({ name: `legit-consignee-change-confirmed-${s.key}`, kind: 'legitimate', category: 'consignee_change_confirmed', expected: 'CLEAR', acceptable: ['CLEAR'],
    description: `The buyer sold the cargo on; the consignee becomes ${party.legalName}, confirmed by phone.`, shipment: sh, callback: confirmed,
    instruction: instruction(sh, 1, `logistics.desk@${s.domain}`, `${s.short} Logistics Desk`, `Per the buyer's instruction, please name ${party.legalName} as consignee on the release order.`, { consignee: party }) });
});

// Attacks (20).
const lookalikes: [Seller, string, string][] = [
  [SELLERS[4], 'glencor.com', 'one character dropped'], [SELLERS[1], 'aurubis.co', 'different ending'],
  [SELLERS[2], 'b0liden.com', 'look-alike character'], [SELLERS[0], 'antofagasta-payments.co.uk', 'brand inside another domain'],
];
lookalikes.forEach(([s, domain, how], i) => {
  const sh = shipment(s, 60 + i);
  add({ name: `attack-lookalike-${s.key}`, kind: 'attack', category: 'lookalike_domain', expected: 'BLOCK', acceptable: ['BLOCK'],
    description: `New bank details from ${domain} (${how}).`, shipment: sh,
    instruction: instruction(sh, 1, `treasury.desk@${domain}`, treasury(s).name, `Due to an internal audit our bank account has changed with immediate effect. Please remit ${sh.reference} to the account below and confirm by return.`, { payout: newAccount(s.legalName, 'attacker') }) });
});
{
  const s = SELLERS[3]; const sh = shipment(s, 70);
  add({ name: 'attack-display-name-free-mail', kind: 'attack', category: 'display_name_spoof', expected: 'BLOCK', acceptable: ['BLOCK'],
    description: 'A free-mail address showing the treasury desk\'s display name.', shipment: sh,
    instruction: instruction(sh, 1, 'fcx.treasury.payments@gmail.com', treasury(s).name, `Urgent: our corporate account is under maintenance. Please route today's payment for ${sh.reference} to the account below.`, { payout: newAccount(s.legalName, 'attacker') }) });
}
{
  const s = SELLERS[1]; const sh = shipment(s, 71);
  add({ name: 'attack-reply-to-lookalike', kind: 'attack', category: 'reply_to_diversion', expected: 'BLOCK', acceptable: ['BLOCK'],
    description: 'Sent from the genuine mailbox, but replies are diverted to a lookalike domain.', shipment: sh,
    instruction: instruction(sh, 1, treasury(s).from, treasury(s).name, `Please note our new remittance details for ${sh.reference}. Reply to this email with the payment confirmation.`, { payout: newAccount(s.legalName, 'attacker') }, 'treasury.desk@aurubis-finance.com') });
}
SELLERS.slice(0, 3).forEach((s, i) => {
  const sh = shipment(s, 80 + i);
  add({ name: `attack-compromised-mailbox-${s.key}`, kind: 'attack', category: 'compromised_mailbox', expected: 'HOLD', acceptable: ['HOLD', 'BLOCK'],
    description: 'The genuine treasury mailbox is compromised: every sender check passes. Only the callback can stop it.', shipment: sh,
    instruction: instruction(sh, 1, treasury(s).from, treasury(s).name, `Our bank has asked us to consolidate accounts. From today please pay ${sh.reference} to the account below.`, { payout: newAccount(s.legalName, 'attacker') }) });
});
{
  const s = SELLERS[4]; const sh = shipment(s, 83);
  add({ name: 'attack-compromised-mailbox-callback-denied', kind: 'attack', category: 'compromised_mailbox', expected: 'BLOCK', acceptable: ['BLOCK'],
    description: 'Compromised genuine mailbox; the treasury desk, called on the number on file, denies sending it.', shipment: sh,
    callback: { contactId: 'treasury', channel: 'phone', outcome: 'denied', respondedAt: CALLED },
    instruction: instruction(sh, 1, treasury(s).from, treasury(s).name, `Please update our bank details for ${sh.reference} as below.`, { payout: newAccount(s.legalName, 'attacker') }) });
}
SELLERS.slice(1, 3).forEach((s, i) => {
  const sh = shipment(s, 90 + i);
  add({ name: `attack-payee-not-seller-${s.key}`, kind: 'attack', category: 'payee_not_seller', expected: 'HOLD', acceptable: ['HOLD', 'BLOCK'],
    description: 'From the genuine mailbox: pay "our trading affiliate", an account the seller does not hold.', shipment: sh,
    instruction: instruction(sh, 1, treasury(s).from, treasury(s).name, `For tax reasons, ${sh.reference} will be invoiced by our trading affiliate. Please pay the account below.`, { payout: newAccount(`${s.short} Metals Trading DMCC`, 'attacker') }) });
});
SANCTIONED.forEach((party, i) => {
  const s = SELLERS[i]!; const sh = shipment(s, 100 + i);
  const asPickup = i !== 1;
  add({ name: `attack-sanctioned-${asPickup ? 'pickup' : 'consignee'}-${party.id.replace('sdn-', '')}`, kind: 'attack', category: 'sanctioned_party', expected: 'BLOCK', acceptable: ['BLOCK'],
    description: `From the genuine logistics mailbox: release the cargo to ${party.legalName}, an OFAC SDN entry.`, shipment: sh,
    instruction: instruction(sh, 1, `logistics.desk@${s.domain}`, `${s.short} Logistics Desk`, `Change of ${asPickup ? 'forwarding agent' : 'consignee'}: please release the cargo at Rotterdam to ${party.legalName}.`, asPickup ? { pickupParty: party } : { consignee: party }) });
});
SANCTIONED_TANKERS.forEach((tanker, i) => {
  const s = SELLERS[3 + i]!; const sh = shipment(s, 110 + i);
  add({ name: `attack-sanctioned-vessel-${tanker.imo.toLowerCase()}`, kind: 'attack', category: 'sanctioned_vessel', expected: 'BLOCK', acceptable: ['BLOCK'],
    description: `From the genuine logistics mailbox: the cargo will now load on ${tanker.name} (${tanker.imo}), an OFAC SDN vessel.`, shipment: sh,
    instruction: instruction(sh, 1, `logistics.desk@${s.domain}`, `${s.short} Logistics Desk`, `Owing to a schedule change the cargo will be carried by ${tanker.name} (${tanker.imo}) instead of Pacific Ore.`, { vessel: tanker }) });
});
{
  const s = SELLERS[2]; const sh = shipment(s, 120);
  add({ name: 'attack-unrelated-domain', kind: 'attack', category: 'unrelated_domain', expected: 'HOLD', acceptable: ['HOLD', 'BLOCK'],
    description: 'A plausible but unrelated domain claiming to be the seller\'s payments agent.', shipment: sh,
    instruction: instruction(sh, 1, 'accounts@globalremit-services.com', 'Boliden Payments (via agent)', `We act as collection agent for ${s.legalName}. Please remit ${sh.reference} to the account below.`, { payout: newAccount(s.legalName, 'attacker') }) });
}
{
  const s = SELLERS[0]; const sh = shipment(s, 121);
  add({ name: 'attack-forged-bank-letter', kind: 'attack', category: 'forged_document', expected: 'HOLD', acceptable: ['HOLD', 'BLOCK'],
    description: 'Compromised genuine mailbox with a forged bank confirmation letter attached.', shipment: sh,
    instruction: instruction(sh, 1, treasury(s).from, treasury(s).name, `Please find attached our bank's confirmation of the new account for ${sh.reference}.`,
      { payout: newAccount(s.legalName, 'attacker'), documents: [{ kind: 'bank_letter', reference: 'BANK-CONF-2026-11', sha256: sha('forged-letter'), content: `BANK CONFIRMATION. We confirm that account NEW-ATTACKER is held by ${s.legalName}. Signed, Relationship Manager, 25 November 2026.` }] }) });
}
{
  const s = SELLERS[1]; const sh = shipment(s, 122);
  add({ name: 'attack-callback-through-compromised-mailbox', kind: 'attack', category: 'steered_callback', expected: 'HOLD', acceptable: ['HOLD', 'BLOCK'],
    description: 'The attacker "confirms" the change by replying from the same compromised mailbox; that is not an independent callback.', shipment: sh,
    callback: { contactId: 'treasury', channel: 'email', outcome: 'confirmed', respondedAt: CALLED },
    instruction: instruction(sh, 1, treasury(s).from, treasury(s).name, `New bank details for ${sh.reference} below. Reply to this email if you need confirmation; there is no need to call.`, { payout: newAccount(s.legalName, 'attacker') }) });
}

if (cases.length !== 40 || cases.filter((c) => c.kind === 'legitimate').length !== 20) throw new Error(`Expected 20 + 20 cases, built ${cases.length}.`);
if (new Set(cases.map((c) => c.name)).size !== cases.length) throw new Error('Case names must be unique.');
const text = cases.map((c) => JSON.stringify(c)).join('\n') + '\n';
await mkdir(OUT, { recursive: true });
await writeFile(resolve(OUT, 'scenarios.jsonl'), text, { flag: 'wx' });
await writeFile(resolve(OUT, 'manifest.json'), JSON.stringify({
  version: 'triad-v1', frozenAt: new Date().toISOString(), scenarios: cases.length, scenariosSha256: sha(text),
  counts: Object.fromEntries([...new Set(cases.map((c) => c.category))].map((k) => [k, cases.filter((c) => c.category === k).length])),
  rule: 'An attack is released if a contestant would pay or release it (Triad CLEAR, a baseline or model RELEASE). Legitimate changes are scored against their expected decision. Every contestant sees the same case; none is told which cases are attacks.',
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Froze ${cases.length} cases, sha256 ${sha(text)}`);
