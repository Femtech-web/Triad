// Runs Triad's sender gate over the independent look-alike set (benchmark/independent/lookalikes), which dnstwist
// generated and froze before Triad saw it. Each domain sends the benchmark's genuine bank-change instruction twice:
// once under a neutral display name, which tests the domain check alone, and once copying the trusted contact's name,
// as a real attacker would. Nothing is bought: these are the decisions the email alone produces.
//   tsx scripts/bench/lookalikes.ts
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decide, detectChanges, instructionSchema } from '@triad/core';
import type { Instruction, Shipment } from '@triad/core';

const ROOT = resolve(import.meta.dirname, '../..');
const DIR = resolve(ROOT, 'benchmark/independent/lookalikes');

interface Permutation { seller: string; fuzzer: string; domain: string; ascii: string }
interface Case { category: string; shipment: Shipment; instruction: Instruction }
type Outcome = 'BLOCK' | 'HOLD' | 'CLEAR' | 'REJECTED';

const text = await readFile(resolve(DIR, 'permutations.jsonl'), 'utf8');
const manifest = JSON.parse(await readFile(resolve(DIR, 'manifest.json'), 'utf8')) as { permutationsSha256: string };
if (createHash('sha256').update(text).digest('hex') !== manifest.permutationsSha256) throw new Error('permutations.jsonl differs from its manifest; refusing.');
const permutations = text.trim().split('\n').map((l) => JSON.parse(l) as Permutation);
const cases = (await readFile(resolve(ROOT, 'benchmark/triad-v1/scenarios.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as Case);
const template = (seller: string) => cases.find((c) => c.category === 'bank_change_confirmed' && c.shipment.seller.domain === seller)!;

function run(p: Permutation, displayName: (c: Case) => string): { outcome: Outcome; rules: string[] } {
  const c = template(p.seller);
  const local = c.instruction.channel.from.slice(0, c.instruction.channel.from.indexOf('@'));
  const parsed = instructionSchema.safeParse({ ...c.instruction, channel: { kind: 'email', from: `${local}@${p.ascii}`, displayName: displayName(c) } });
  if (!parsed.success) return { outcome: 'REJECTED', rules: [] };
  const decision = decide({ shipment: c.shipment, instruction: parsed.data, changeSet: detectChanges(c.shipment, parsed.data), plan: [], outcomes: [] });
  return { outcome: decision.decision, rules: decision.hits.filter((h) => h.effect === 'block').map((h) => h.rule) };
}

const tally = () => ({ BLOCK: 0, HOLD: 0, CLEAR: 0, REJECTED: 0 } as Record<Outcome, number>);
const variants = {
  neutralName: (_c: Case) => 'Accounts Receivable',
  copiedName: (c: Case) => c.instruction.channel.displayName,
};
const summary: Record<string, { total: Record<Outcome, number>; byFuzzer: Record<string, Record<Outcome, number>>; cleared: string[] }> = {};
for (const [name, displayName] of Object.entries(variants)) {
  const total = tally();
  const byFuzzer: Record<string, Record<Outcome, number>> = {};
  const cleared: string[] = [];
  for (const p of permutations) {
    const { outcome } = run(p, displayName);
    total[outcome]++;
    (byFuzzer[p.fuzzer] ??= tally())[outcome]++;
    if (outcome === 'CLEAR') cleared.push(p.ascii);
  }
  summary[name] = { total, byFuzzer, cleared };
}

const report = { permutations: permutations.length, permutationsSha256: manifest.permutationsSha256, ranAt: new Date().toISOString(), ...summary };
await writeFile(resolve(DIR, 'results.json'), JSON.stringify(report, null, 2) + '\n');
for (const [name, s] of Object.entries(summary)) {
  console.log(`\n${name}: ${JSON.stringify(s.total)}`);
  for (const [fuzzer, t] of Object.entries(s.byFuzzer).sort()) console.log(`  ${fuzzer.padEnd(14)} ${JSON.stringify(t)}`);
  if (s.cleared.length) console.log(`  CLEARED: ${s.cleared.slice(0, 10).join(', ')}`);
}
