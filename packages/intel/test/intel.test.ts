import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTENTS } from '@triad/core';
import type { CheckKind, CheckRequest, Subject } from '@triad/core';
import { buildDirectory, consolidate, deliveredBodySchema, gather, interpret, SdnList } from '../src/index.js';
import type { Delivery, TelegraphClient } from '../src/index.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const sdn = SdnList.parse(fixture('sdn-slice.csv'), fixture('alt-slice.csv'), { url: 'https://www.treasury.gov/ofac/downloads/sdn.csv', sha256: 'f'.repeat(64), retrievedAt: '2026-11-24T06:16:06Z', entries: 0 });

// Real answers bought through ranked routing on 24 Nov 2026 (docs/results/readiness-2026-11-23).
const probes = fixture('paid-probes-2026-11-24.jsonl').trim().split('\n').map((l) => JSON.parse(l) as { intent: string; params: Record<string, string>; body: unknown; receipt: { receipt_hash: string } });
function delivery(index: number): Delivery {
  const probe = probes[index]!;
  const body = deliveredBodySchema.parse(probe.body);
  return { body, minerName: body.miner_name ?? null, purchase: { rail: 'sepolia-escrow', receiptHash: probe.receipt.receipt_hash, signalHash: body.signal_hash ?? null, amountUusdc: '10000', minerId: body.miner_id ?? null, latencyMs: 1 } };
}
function check(kind: CheckKind, subject: Subject, params: Record<string, string>, required = true): CheckRequest {
  return { id: `${kind}:test`, check: kind, intent: INTENTS[kind], params, role: 'seller', subject, required, purpose: `Test ${kind}.` };
}
const glencore: Subject = { kind: 'entity', name: 'Glencore International AG', country: 'CH' };

test('real answers are read strictly: an answer that names no company is unbound, a missing field is unreadable', () => {
  const registry = interpret(check('registry', glencore, probes[0]!.params), delivery(0));
  assert.deepEqual([registry.status, registry.fields.active], ['unbound', true]);
  assert.match(registry.detail, /^LiveCert .* said "active" without naming the company/);
  const sanctions = interpret(check('sanctions', glencore, probes[1]!.params), delivery(1));
  assert.deepEqual([sanctions.status, sanctions.fields.matched, sanctions.fields.lists], ['answered', false, 'OFAC SDN']);
  const vat = interpret(check('vat', { kind: 'entity', name: 'Aurubis AG', country: 'DE' }, probes[3]!.params, false), delivery(3));
  assert.equal(vat.status, 'unreadable');
  const identity = interpret(check('identity', glencore, probes[4]!.params, false), delivery(4));
  assert.deepEqual([identity.status, identity.fields.domain], ['answered', 'glencore.com']);
  assert.equal(interpret(check('mail', { kind: 'domain', domain: 'glencore.com' }, probes[5]!.params, false), delivery(5)).fields.lookup_ok, true);
  assert.equal(interpret(check('document', { kind: 'document', reference: 'letter', sha256: 'e'.repeat(64) }, probes[6]!.params, false), delivery(6)).fields.verdict, 'Inconclusive');
  assert.equal(interpret(check('vessel', { kind: 'vessel', name: 'Ever Given', imo: 'IMO9811000' }, probes[7]!.params, false), delivery(7)).status, 'unreadable');
});

test("OFAC's list catches what the ranked answer missed, by alias and by vessel IMO", () => {
  assert.deepEqual(sdn.matchName('PAO Sovcomflot').map((m) => m.entNum), ['34741']);
  assert.deepEqual(sdn.matchName('Sovcomflot').map((m) => m.entNum), ['34741'], 'one distinctive word is enough');
  assert.deepEqual(sdn.matchName('Glencore International AG'), []);
  assert.deepEqual(sdn.matchName('Global'), [], 'a common word alone never matches');
  assert.equal(sdn.matchImo('IMO9413559')?.name, 'NS ANTARCTIC');
  const missed = interpret(check('sanctions', { kind: 'entity', name: 'PAO Sovcomflot', country: 'RU' }, probes[2]!.params), delivery(2));
  assert.equal(missed.fields.matched, false, 'the routed answer on 24 Nov said no match');
  const outcome = consolidate(check('sanctions', { kind: 'entity', name: 'PAO Sovcomflot', country: 'RU' }, {}), [missed, sdn.answer({ kind: 'entity', name: 'PAO Sovcomflot' })]);
  assert.deepEqual([outcome.status, outcome.fields.matched], ['answered', true]);
  assert.match(outcome.detail, /JOINT STOCK COMPANY SOVCOMFLOT \(SDN 34741; UKRAINE-EO13662\] \[RUSSIA-EO14024\)\..* said no match\./);
  assert.equal(outcome.sources.find((s) => s.kind === 'official')?.snapshot?.sha256, 'f'.repeat(64));
});

test('sources that disagree hold; sources that agree corroborate; no usable source reports the most telling failure', () => {
  const said = (name: string, matched: boolean) => ({ kind: 'telegraph' as const, name, status: 'answered' as const, fields: { matched }, detail: `${name}: ${matched}`, purchase: null });
  const c = check('sanctions', glencore, {});
  assert.equal(consolidate(c, [said('A', false), said('B', true)]).status, 'conflict');
  const agree = consolidate(c, [said('A', false), said('B', false), sdn.answer({ kind: 'entity', name: 'Glencore International AG' })]);
  assert.deepEqual([agree.status, agree.fields.sources_agreeing], ['answered', 3]);
  assert.match(agree.detail, /\(3 sources agree\)$/);
  const failed = consolidate(check('registry', glencore, {}), [
    { kind: 'telegraph', name: 'A', status: 'unavailable', fields: {}, detail: 'HTTP 503.', purchase: null },
    { kind: 'telegraph', name: 'B', status: 'unbound', fields: { active: true }, detail: 'Named no company.', purchase: null },
  ]);
  assert.equal(failed.status, 'unbound');
});

test('gather asks required checks twice, optional checks once, and adds the official list to sanctions', async () => {
  const asked: string[] = [];
  const telegraph: TelegraphClient = {
    rail: 'sepolia-escrow',
    async ask(intent, _params, { minerId }) {
      asked.push(`${intent}@${minerId ?? 'routed'}`);
      const body = deliveredBodySchema.parse({ miner_id: minerId ?? '302', miner_name: minerId ? 'Second' : 'Routed', result_shape: 'intent', result: intent === INTENTS.sanctions ? { matched: false } : { domain: 'glencore.com' } });
      return { status: 'delivered', delivery: { body, minerName: body.miner_name ?? null, purchase: { rail: 'sepolia-escrow', receiptHash: null, signalHash: null, amountUusdc: '10000', minerId: body.miner_id ?? null, latencyMs: 1 } } };
    },
  };
  const scored = (intent: string, epoch: number, rank: number, score: number) => ({ intent_id: intent, epoch_id: epoch, rank, score });
  const directory = buildDirectory([
    { id: '302', slug: 'routed', name: 'Routed', supported_intents: [INTENTS.sanctions], scores: [scored(INTENTS.sanctions, 47, 1, 1)] },
    { id: '777', slug: 'zk-sanctions', name: 'ZK Sanctions', supported_intents: [INTENTS.sanctions], scores: [scored(INTENTS.sanctions, 47, 2, 1)] },
    { id: '888', slug: 'old-rank-1', name: 'Old', supported_intents: [INTENTS.sanctions], scores: [scored(INTENTS.sanctions, 40, 1, 1)] },
    { id: '999', slug: 'zero', name: 'Zero', supported_intents: [INTENTS.sanctions], scores: [scored(INTENTS.sanctions, 47, 3, 0)] },
    { id: '555', slug: 'retired', name: 'Retired', activation_status: 'deregistered', supported_intents: [INTENTS.sanctions] },
  ]);
  assert.deepEqual(directory.ranked(INTENTS.sanctions).map((m) => m.id), ['302', '777', '999', '888'], 'latest epoch by rank, then older scores; retired Miners excluded');
  assert.equal(directory.secondSource(INTENTS.sanctions, ['302', '777'])?.id, '888', 'a positive score beats a zero one');
  const plan = [check('sanctions', { kind: 'vessel', name: 'NS Antarctic', imo: 'IMO9413559' }, { name: 'NS Antarctic' }), check('identity', glencore, { company: 'Glencore International AG' }, false)];
  const [vessel, identity] = await gather(plan, { telegraph, directory, sdn });
  assert.deepEqual(asked.sort(), [`${INTENTS.identity}@routed`, `${INTENTS.sanctions}@777`, `${INTENTS.sanctions}@routed`], 'checks run in parallel');
  assert.deepEqual([vessel!.status, vessel!.fields.matched, vessel!.sources.length], ['answered', true, 3]);
  assert.deepEqual([identity!.status, identity!.sources.length], ['answered', 1]);
});
