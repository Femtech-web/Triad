import { createHash } from 'node:crypto';
import { decide } from '@triad/core';
import type { CallbackResult } from '@triad/core';
import { canonicalJson, contentProblems } from './canonical.js';
import type { EvidenceFile } from './canonical.js';

export * from './canonical.js';

export function evidenceHash(file: EvidenceFile): `0x${string}` {
  return `0x${createHash('sha256').update(canonicalJson(file)).digest('hex')}`;
}

export function buildEvidence(input: Omit<EvidenceFile, 'format' | 'generatedAt' | 'cost'> & { generatedAt?: string }): EvidenceFile {
  const purchases = input.outcomes.flatMap((o) => o.sources.flatMap((s) => (s.purchase ? [s.purchase] : [])));
  return {
    format: 'triad-evidence-v1',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    provenance: input.provenance,
    shipment: input.shipment,
    instruction: input.instruction,
    changeSet: input.changeSet,
    plan: input.plan,
    outcomes: input.outcomes,
    decision: input.decision,
    cost: { telegraphUusdc: purchases.reduce((sum, p) => sum + BigInt(p.amountUusdc), 0n).toString(), purchases: purchases.length },
  };
}

// What anyone can check without Triad: the hash, and that every paid answer has a receipt and a signal hash.
// Receipts and signals are then checked against Telegraph's node, which is a network step left to the caller.
export function verifyEvidence(file: EvidenceFile, expectedHash?: string): { ok: boolean; hash: string; problems: string[] } {
  const hash = evidenceHash(file);
  const problems = [
    ...(expectedHash && expectedHash.toLowerCase() !== hash ? [`Hash ${hash} does not match the expected ${expectedHash}.`] : []),
    ...contentProblems(file),
  ];
  return { ok: problems.length === 0, hash, problems };
}

// The trusted contact's answer, decided on the same paid answers: nothing is bought again, and the new file records
// who answered. Only a decision waiting for a callback takes one; a block is final.
export function withCallback(file: EvidenceFile, outcome: CallbackResult['outcome'], respondedAt: string, answeredBy: string): EvidenceFile {
  const target = file.decision.callback.target;
  if (!file.decision.needs.includes('callback') || !target) throw new Error('This decision is not waiting for a callback.');
  const { shipment, instruction, changeSet, plan, outcomes } = file;
  const decision = decide({ shipment, instruction, changeSet, plan, outcomes, callback: { contactId: target.contactId, channel: target.channel, outcome, respondedAt } });
  const synthetic = [...file.provenance.synthetic.filter((s) => !s.startsWith('callback')), `callback (${answeredBy})`];
  return buildEvidence({ provenance: { ...file.provenance, synthetic }, shipment, instruction, changeSet, plan, outcomes, decision, generatedAt: respondedAt });
}
