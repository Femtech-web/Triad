import 'server-only';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvidenceFile } from '@triad/evidence';

// The public record, as synced from the repository by scripts/web/sync-data.mjs. Read on the server only.
const DATA = join(process.cwd(), 'data');

export interface StoredEvidence { file: string; evidence_sha256: string; evidence: EvidenceFile }
export interface StoredRelease { file: string; rail: string; escrow: string; transaction: string; explorer: string; evidenceFile: string; authorization: { evidenceHash: string; payee: string; amount: string; signer: string }; releasedAt: string }

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const list = (dir: string) => (existsSync(join(DATA, dir)) ? readdirSync(join(DATA, dir)).filter((f) => f.endsWith('.json')).sort() : []);

export function decisions(): StoredEvidence[] {
  const fromRuns = list('decisions').map((file) => ({ file, ...readJson<Omit<StoredEvidence, 'file'>>(join(DATA, 'decisions', file)) }));
  const fromBenchmark = list('benchmark/evidence').map((file) => ({ file: `benchmark/${file}`, ...readJson<Omit<StoredEvidence, 'file'>>(join(DATA, 'benchmark/evidence', file)) }));
  return [...fromRuns, ...fromBenchmark];
}

export function evidenceByHash(hash: string): StoredEvidence | null {
  return decisions().find((d) => d.evidence_sha256.toLowerCase() === hash.toLowerCase()) ?? null;
}

export function releases(): StoredRelease[] {
  return list('releases').map((file) => ({ file, ...readJson<Omit<StoredRelease, 'file'>>(join(DATA, 'releases', file)) }));
}

// Checks sold to agents over x402, oldest first.
export interface StoredSale { file: string; network: string; amountUusdc: string; payer: string; transaction: string; explorer: string; decision: string; evidence_sha256: string; at: string }
export function sales(): StoredSale[] {
  return list('sales').map((file) => ({ file, ...readJson<Omit<StoredSale, 'file'>>(join(DATA, 'sales', file)) }));
}

export function deployment(network: 'sepolia' | 'solana-devnet'): { address?: string; programId?: string; transaction?: string } | null {
  const path = join(DATA, 'deployments', `${network}.json`);
  return existsSync(path) ? readJson(path) : null;
}

// The decision with the most paid evidence for a scenario: the one to show as its proof.
export function bestDecision(scenario: string): StoredEvidence | null {
  return decisions().filter((d) => d.evidence.provenance.scenario === scenario).sort((a, b) => b.evidence.cost.purchases - a.evidence.cost.purchases)[0] ?? null;
}

export interface BenchmarkSummary { contestant: string; answered: number; attacks: number; attacksReleased: string[]; attacksStopped: number; legitimate: number; legitimateAsExpected: number; legitimateBlocked: string[]; legitimateHeldInstead: string[]; exact?: number; testUsdc?: number; purchases?: number }
export interface BenchmarkResult { scenario: string; contestant: 'triad' | 'baseline' | 'frontier'; verdict: 'RELEASE' | 'HOLD' | 'BLOCK' | null; decision?: string; needs?: string[]; rules?: string[]; reason?: string; evidence_sha256?: string; cost_uusdc?: string; purchases?: number; latency_ms: number; at: string }
export interface BenchmarkReport { gradedAt: string; summary: BenchmarkSummary[]; categories: { category: string; kind: string; cases: number; triad: string; baseline: string; frontier: string }[]; results: BenchmarkResult[] }
export function benchmarkReport(): BenchmarkReport | null {
  const path = join(DATA, 'benchmark/report.json');
  return existsSync(path) ? readJson(path) : null;
}

export interface BenchmarkManifest { version: string; frozenAt: string; scenarios: number; scenariosSha256: string; counts: Record<string, number>; rule: string }
export function benchmarkManifest(): BenchmarkManifest | null {
  const path = join(DATA, 'benchmark/manifest.json');
  return existsSync(path) ? readJson(path) : null;
}

export const releasesFor = (hash: string): StoredRelease[] => releases().filter((r) => r.authorization.evidenceHash.toLowerCase() === hash.toLowerCase());

export interface RoiOutcome { attacksReleased: number; paperLossUsd: number; legitimateBlocked: number; legitimateBlockedUsd: number; legitimateHeldInsteadOfCleared: number; legitimateHeldUsd: number }
export interface RoiReport {
  basis: string; pricesAsOf: string; note: string; spend: { usdc: number; answers: number; currency: string };
  attacks: { count: number; paperValueUsd: number }; legitimate: { count: number; paperValueUsd: number };
  triad: RoiOutcome; baseline: RoiOutcome; lossAvoidedVsBaselineUsd: number; lossAvoidedPerUsdc: number; medianSpendPerMillionUsd: number;
  prices: Record<string, { usdPerTonne: number; basis: string; source: string }>;
}
export function roiReport(): RoiReport | null {
  const path = join(DATA, 'benchmark/roi.json');
  return existsSync(path) ? readJson(path) : null;
}
export type PaperPrices = Record<string, number>;
export function paperPrices(): PaperPrices {
  const path = join(DATA, 'benchmark/prices.json');
  if (!existsSync(path)) return {};
  const { commodities } = readJson<{ commodities: Record<string, { usdPerTonne: number }> }>(path);
  return Object.fromEntries(Object.entries(commodities).map(([k, v]) => [k, v.usdPerTonne]));
}

export interface LookalikeResults { permutations: number; permutationsSha256: string; neutralName: { total: Record<string, number> }; copiedName: { total: Record<string, number> } }
export function lookalikeResults(): LookalikeResults | null {
  const path = join(DATA, 'benchmark/lookalikes.json');
  return existsSync(path) ? readJson(path) : null;
}
