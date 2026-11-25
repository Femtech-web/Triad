import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decide, detectChanges, planChecks } from '@triad/core';
import type { Instruction, Shipment } from '@triad/core';
import { buildEvidence, canonicalJson, evidenceHash, evidenceHashWeb, verifyEvidence, withCallback } from '../src/index.js';
import type { EvidenceFile } from '../src/index.js';

test('canonical JSON is independent of key order and drops undefined values', () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, 'x'], c: undefined }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(canonicalJson({ z: { y: 2, x: 1 } }), canonicalJson({ z: { x: 1, y: 2 } }));
  assert.equal(canonicalJson(10n), '"10"');
  assert.throws(() => canonicalJson({ n: Number.NaN }), /non-finite/);
});

test('verification recomputes the hash and requires a receipt for every paid answer', () => {
  const purchase = { rail: 'sepolia-escrow' as const, receiptHash: '0x' + 'a'.repeat(64), signalHash: '0x' + 'b'.repeat(64), amountUusdc: '10000', minerId: '1', latencyMs: 1 };
  const file = {
    format: 'triad-evidence-v1', generatedAt: '2026-11-24T00:00:00Z', provenance: { scenario: 't', synthetic: ['shipment'], network: 'testnet' },
    outcomes: [{ checkId: 'sanctions:seller', status: 'answered', fields: {}, detail: '', sources: [
      { kind: 'telegraph', name: 'A', status: 'answered', fields: {}, detail: '', purchase },
      { kind: 'official', name: 'OFAC SDN list', status: 'answered', fields: {}, detail: '', purchase: null, snapshot: { url: 'u', sha256: 'c'.repeat(64), retrievedAt: 'now' } },
    ] }],
  } as unknown as EvidenceFile;
  const hash = evidenceHash(file);
  assert.deepEqual(verifyEvidence(file, hash), { ok: true, hash, problems: [] });
  const tampered = { ...file, generatedAt: '2026-11-25T00:00:00Z' } as EvidenceFile;
  assert.equal(verifyEvidence(tampered, hash).ok, false);
  const unreceipted = structuredClone(file);
  unreceipted.outcomes[0]!.sources[0]!.purchase!.receiptHash = null;
  assert.match(verifyEvidence(unreceipted).problems.join(), /has no receipt or signal hash/);
});

test('Web Crypto, as a browser runs it, computes the same hash as the server', async () => {
  const file = { format: 'triad-evidence-v1', generatedAt: '2026-11-25T00:00:00Z', note: 'Glencore Treasury Desk, Zürich', n: [1, 2.5] } as unknown as EvidenceFile;
  assert.equal(await evidenceHashWeb(file), evidenceHash(file));
});

// A frozen benchmark case: Glencore's genuine treasury mailbox asks to move the payout. Every check answers cleanly,
// so only the callback stands between the change and the money.
function heldForCallback(): EvidenceFile {
  const line = readFileSync(new URL('../../../benchmark/triad-v1/scenarios.jsonl', import.meta.url), 'utf8').split('\n')
    .find((l) => l.includes('"legit-bank-change-awaiting-callback-glencore"'))!;
  const { shipment, instruction } = JSON.parse(line) as { shipment: Shipment; instruction: Instruction };
  const changeSet = detectChanges(shipment, instruction);
  const plan = planChecks(shipment, changeSet);
  const clean: Record<string, Record<string, unknown>> = { registry: { active: true }, sanctions: { matched: false } };
  const outcomes = plan.map((c) => ({ checkId: c.id, status: 'answered' as const, fields: clean[c.check] ?? {}, detail: 'clean', sources: [] }));
  const decision = decide({ shipment, instruction, changeSet, plan, outcomes });
  return buildEvidence({ provenance: { scenario: 'test', synthetic: [], network: 'testnet' }, shipment, instruction, changeSet, plan, outcomes, decision, generatedAt: '2026-11-25T09:00:00Z' });
}

test('the trusted contact decides a held change on the same answers: a confirmation clears it, a denial blocks it', () => {
  const held = heldForCallback();
  assert.equal(held.decision.decision, 'HOLD');
  assert.deepEqual(held.decision.needs, ['callback']);
  assert.equal(held.decision.callback.target?.channel, 'phone');

  const confirmed = withCallback(held, 'confirmed', '2026-11-25T09:05:00Z', 'answered in the console');
  assert.equal(confirmed.decision.decision, 'CLEAR');
  assert.equal(confirmed.decision.callback.accepted, true);
  assert.deepEqual(confirmed.outcomes, held.outcomes);
  assert.ok(confirmed.provenance.synthetic.includes('callback (answered in the console)'));

  const denied = withCallback(held, 'denied', '2026-11-25T09:05:00Z', 'answered in the console');
  assert.equal(denied.decision.decision, 'BLOCK');
  assert.ok(denied.decision.hits.some((h) => h.rule === 'R-CALLBACK-DENIED'));
  assert.throws(() => withCallback(denied, 'confirmed', '2026-11-25T09:10:00Z', 'x'), /not waiting for a callback/);
});
