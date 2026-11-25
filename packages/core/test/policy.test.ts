import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, detectChanges, planChecks, shipmentSchema } from '../src/index.js';
import type { CallbackResult, CheckOutcome, Instruction } from '../src/index.js';
import { answered, cleanEvidence, instruction, newAccount, shipment } from './fixtures.js';

function run(ins: Instruction, outcomes: (planIds: string[]) => CheckOutcome[], callback?: CallbackResult, record = shipment) {
  const changeSet = detectChanges(record, ins);
  const plan = planChecks(record, changeSet);
  const decision = decide({ shipment: record, instruction: ins, changeSet, plan, outcomes: outcomes(plan.map((c) => c.id)), ...(callback ? { callback } : {}) });
  return { changeSet, plan, decision, rules: decision.hits.map((h) => h.rule) };
}
const phoneConfirm: CallbackResult = { contactId: 'maria', channel: 'phone', outcome: 'confirmed', respondedAt: '2026-11-23T10:00:00Z' };
const withVessel = (outcomes: CheckOutcome[]) => [...outcomes, answered('sanctions:vessel', { matched: false })];
const bankChange = (from?: string, extra: Partial<Parameters<typeof instruction>[0]> = {}) => instruction({ ...(from ? { from } : {}), ...extra, changes: { payout: newAccount() } });

test('an unchanged instruction from an authorized contact clears without buying anything', () => {
  const { plan, decision } = run(instruction(), () => []);
  assert.equal(plan.length, 0);
  assert.equal(decision.decision, 'CLEAR');
});

test('new bank details from the genuine mailbox hold for a phone callback, even when every check passes', () => {
  const { plan, decision, rules } = run(bankChange(), () => withVessel(cleanEvidence()));
  assert.deepEqual(plan.map((c) => c.id), ['registry:seller', 'sanctions:seller', 'vat:seller', 'sanctions:vessel', 'vessel:vessel']);
  assert.deepEqual(rules, ['R-PAYOUT-CHANGED']);
  assert.deepEqual([decision.decision, decision.needs], ['HOLD', ['callback']]);
  assert.deepEqual(decision.callback.target, { contactId: 'maria', name: 'María Rojas', channel: 'phone', address: '+56221234567' });
  assert.ok(decision.facts.includes('Andesite Copper SA is an active registered company (96.555.123-4).'));
  assert.equal(run(bankChange(), () => withVessel(cleanEvidence()), phoneConfirm).decision.decision, 'CLEAR');
});

test('a confirmation through the mailbox that sent the change does not count', () => {
  const sameMailbox: CallbackResult = { contactId: 'maria', channel: 'email', outcome: 'confirmed', respondedAt: '2026-11-23T10:00:00Z' };
  const { decision } = run(bankChange(), () => withVessel(cleanEvidence()), sameMailbox);
  assert.equal(decision.decision, 'HOLD');
  assert.equal(decision.callback.accepted, false);
  assert.match(decision.unknowns.join(' '), /not to the trusted contact and channel/);
});

test('a lookalike sender is blocked, and no callback can override it', () => {
  const { decision, rules, plan } = run(bankChange('m.rojas@andesitecoper.cl'), () => withVessel(cleanEvidence()), phoneConfirm);
  assert.equal(decision.decision, 'BLOCK');
  assert.ok(rules.includes('R-SENDER-LOOKALIKE'));
  assert.ok(plan.some((c) => c.id === 'identity:seller') && plan.some((c) => c.id === 'mail:sender_domain'), 'corroborating checks are bought for an outside sender');
});

test('a display name copied from a free-mail address is blocked', () => {
  const { decision, rules } = run(bankChange('andesite.treasury@gmail.com', { displayName: 'Maria Rojas' }), () => withVessel(cleanEvidence()));
  assert.equal(decision.decision, 'BLOCK');
  assert.deepEqual(rules.filter((r) => r.startsWith('R-SENDER') || r.startsWith('R-DISPLAY')), ['R-SENDER-OUTSIDE-DOMAIN', 'R-DISPLAY-NAME-SPOOF']);
});

test('replies diverted to a lookalike domain are blocked', () => {
  assert.equal(run(bankChange(undefined, { replyTo: 'm.rojas@andesitecopper.co' }), () => withVessel(cleanEvidence())).decision.decision, 'BLOCK');
});

test('a payee who is not the seller is screened, and a sanctions match blocks', () => {
  const ins = instruction({ changes: { payout: newAccount('Andesite Trading DMCC') } });
  const clean = run(ins, () => [...cleanEvidence(), answered('registry:payee', { active: true }), answered('sanctions:payee', { matched: false })]);
  assert.ok(clean.plan.some((c) => c.id === 'sanctions:payee' && c.required));
  assert.ok(clean.rules.includes('R-PAYEE-NOT-SELLER'));
  assert.equal(clean.decision.decision, 'HOLD');
  const sanctioned = run(ins, () => [...cleanEvidence(), answered('registry:payee', { active: true }), answered('sanctions:payee', { matched: true, lists: 'OFAC SDN' })], phoneConfirm);
  assert.equal(sanctioned.decision.decision, 'BLOCK');
  assert.match(sanctioned.decision.warnings.join(' '), /Andesite Trading DMCC matches a sanctions list entry \(OFAC SDN\)/);
});

test('missing or wrong-entity evidence never clears, even after a confirmed callback', () => {
  const outage = run(bankChange(), () => withVessel(cleanEvidence()).filter((o) => o.checkId !== 'registry:seller'), phoneConfirm);
  assert.deepEqual([outage.decision.decision, outage.decision.needs], ['HOLD', ['evidence']]);
  assert.ok(outage.rules.includes('R-EVIDENCE-MISSING'));
  const unavailable = run(bankChange(), () => withVessel(cleanEvidence()).map((o) => o.checkId === 'sanctions:seller' ? { ...o, status: 'unavailable' as const, detail: 'Telegraph returned 503.' } : o), phoneConfirm);
  assert.equal(unavailable.decision.decision, 'HOLD');
  const wrongEntity = run(bankChange(), () => withVessel(cleanEvidence()).map((o) => o.checkId === 'registry:seller' ? { ...o, status: 'wrong_entity' as const, detail: 'The registry answered about Andes Copper Holdings Ltd.' } : o), phoneConfirm);
  assert.deepEqual([wrongEntity.decision.decision, wrongEntity.rules.includes('R-WRONG-ENTITY')], ['HOLD', true]);
  const silent = run(bankChange(), () => withVessel(cleanEvidence()).map((o) => o.checkId === 'registry:seller' ? { ...o, fields: {} } : o), phoneConfirm);
  assert.equal(silent.decision.decision, 'HOLD', 'an answer that does not say whether the company is active is not a pass');
  const unbound = run(bankChange(), () => withVessel(cleanEvidence()).map((o) => o.checkId === 'registry:seller' ? { ...o, status: 'unbound' as const, detail: 'The registry answer named no company.' } : o), phoneConfirm);
  assert.deepEqual([unbound.decision.decision, unbound.rules.includes('R-EVIDENCE-MISSING')], ['HOLD', true]);
  const disagree = run(bankChange(), () => withVessel(cleanEvidence()).map((o) => o.checkId === 'sanctions:seller' ? { ...o, status: 'conflict' as const, fields: {}, detail: 'One source found a match; another did not.' } : o), phoneConfirm);
  assert.deepEqual([disagree.decision.decision, disagree.rules.includes('R-SOURCES-DISAGREE')], ['HOLD', true]);
});

test('an inactive company or a forged document blocks', () => {
  assert.equal(run(bankChange(), () => withVessel(cleanEvidence()).map((o) => o.checkId === 'registry:seller' ? answered('registry:seller', { active: false }) : o)).decision.decision, 'BLOCK');
  const letter = { kind: 'bank_letter' as const, reference: 'BANK-LETTER-11', sha256: 'd'.repeat(64), content: 'We confirm the account below belongs to Andesite Copper SA.' };
  const forged = run(instruction({ changes: { payout: newAccount(), documents: [letter] } }), () => [...cleanEvidence(), answered('document:document', { verdict: 'Forged' })]);
  assert.equal(forged.decision.decision, 'BLOCK');
  assert.ok(forged.plan.some((c) => c.id === 'document:document' && !c.required));
});

test('a denied callback blocks; a changed consignee holds for the callback', () => {
  const denied = run(bankChange(), () => withVessel(cleanEvidence()), { ...phoneConfirm, outcome: 'denied' });
  assert.deepEqual([denied.decision.decision, denied.rules.includes('R-CALLBACK-DENIED')], ['BLOCK', true]);
  const consignee = { id: 'new-consignee', legalName: 'Baltic Ore Logistics OU', country: 'NO', contacts: [] };
  const swap = run(instruction({ changes: { consignee } }), () => withVessel([answered('registry:consignee', { active: true }), answered('sanctions:consignee', { matched: false })]));
  assert.deepEqual([swap.decision.decision, swap.rules], ['HOLD', ['R-CARGO-PARTY-CHANGED']]);
});

test('when the only authorized contact sent the change and has no phone, there is no out-of-band channel', () => {
  const tomasOnly = shipmentSchema.parse({ ...shipment, authorizedContactIds: ['tomas'] });
  const { decision, rules } = run(bankChange('t.vidal@andesitecopper.cl'), () => withVessel(cleanEvidence()), undefined, tomasOnly);
  assert.equal(decision.callback.target, null);
  assert.ok(rules.includes('R-NO-OUT-OF-BAND-CHANNEL'));
  assert.deepEqual(decision.needs, ['callback', 'evidence']);
});

test('a substitute vessel holds for the callback and is the vessel screened; a sanctioned one blocks', () => {
  const ins = instruction({ changes: { vessel: { name: 'NS Antarctic', imo: 'IMO9413559' } } });
  const swap = run(ins, () => [answered('sanctions:vessel', { matched: false })]);
  assert.ok(swap.rules.includes('R-VESSEL-CHANGED'));
  assert.deepEqual(swap.plan.find((c) => c.id === 'sanctions:vessel')?.subject, { kind: 'vessel', name: 'NS Antarctic', imo: 'IMO9413559' });
  assert.equal(swap.decision.decision, 'HOLD');
  assert.equal(run(ins, () => [answered('sanctions:vessel', { matched: true, lists: 'OFAC SDN' })]).decision.decision, 'BLOCK');
});
