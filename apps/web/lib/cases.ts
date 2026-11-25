import 'server-only';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Instruction, Shipment } from '@triad/core';
import { bestDecision } from './data';

// The cases the console offers: the two showcase scenarios with paid runs on record, then the forty frozen benchmark
// cases. Each carries its recorded run, when there is one, so it can be replayed without buying anything.

export interface ConsoleCase {
  name: string;
  group: 'showcase' | 'attack' | 'legitimate';
  category: string;
  expected: 'CLEAR' | 'HOLD' | 'BLOCK' | null;
  description: string;
  synthetic: string[];
  shipment: Shipment;
  instruction: Instruction;
  recorded: { hash: string; decision: 'CLEAR' | 'HOLD' | 'BLOCK'; purchases: number } | null;
}

const DATA = join(process.cwd(), 'data');
const SHOWCASE_CATEGORY: Record<string, string> = { 'pickup-swap-sanctioned': 'sanctioned_party', 'release-on-schedule-sepolia': 'settle_as_agreed' };

interface RawCase { name: string; kind?: string; category?: string; expected?: string; description: string; synthetic: string[]; shipment: Shipment; instruction: Instruction }

function recordedBenchmarkRun(name: string): ConsoleCase['recorded'] {
  const path = join(DATA, 'benchmark/evidence', `${name}.json`);
  if (!existsSync(path)) return null;
  const { evidence_sha256, evidence } = JSON.parse(readFileSync(path, 'utf8')) as { evidence_sha256: string; evidence: { decision: { decision: 'CLEAR' | 'HOLD' | 'BLOCK' }; cost: { purchases: number } } };
  return { hash: evidence_sha256, decision: evidence.decision.decision, purchases: evidence.cost.purchases };
}

let cached: ConsoleCase[] | null = null;
export function consoleCases(): ConsoleCase[] {
  if (cached) return cached;
  const showcaseDir = join(DATA, 'showcase');
  const showcase: ConsoleCase[] = (existsSync(showcaseDir) ? readdirSync(showcaseDir).filter((f) => f.endsWith('.json')).sort() : []).map((file) => {
    const raw = JSON.parse(readFileSync(join(showcaseDir, file), 'utf8')) as RawCase;
    const best = bestDecision(raw.name);
    return {
      name: raw.name, group: 'showcase', category: SHOWCASE_CATEGORY[raw.name] ?? 'on_record', expected: null, description: raw.description, synthetic: raw.synthetic,
      shipment: raw.shipment, instruction: raw.instruction,
      recorded: best ? { hash: best.evidence_sha256, decision: best.evidence.decision.decision, purchases: best.evidence.cost.purchases } : null,
    };
  });
  const benchmarkFile = join(DATA, 'benchmark/scenarios.jsonl');
  const benchmark: ConsoleCase[] = (existsSync(benchmarkFile) ? readFileSync(benchmarkFile, 'utf8').split('\n').filter(Boolean) : []).map((line) => {
    const raw = JSON.parse(line) as RawCase;
    return {
      name: raw.name, group: raw.kind === 'attack' ? 'attack' : 'legitimate', category: raw.category ?? 'other',
      expected: (raw.expected as ConsoleCase['expected']) ?? null, description: raw.description, synthetic: raw.synthetic,
      shipment: raw.shipment, instruction: raw.instruction, recorded: recordedBenchmarkRun(raw.name),
    };
  });
  cached = [...showcase, ...benchmark];
  return cached;
}

export const consoleCase = (name: string): ConsoleCase | null => consoleCases().find((c) => c.name === name) ?? null;
