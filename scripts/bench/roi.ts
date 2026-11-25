// Mission 08 asks for the P&L of each unit of intelligence bought. Values every benchmark shipment on paper (prices.json),
// then sets what Triad spent on intelligence against the losses it avoided and the genuine payments it delayed, beside
// the baseline that used the same answers. The positions are paper and the spend is testnet USDC; the ratio is shown anyway.
//   tsx scripts/bench/roi.ts
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DIR = resolve(import.meta.dirname, '../../benchmark/triad-v1');

interface Case { name: string; kind: 'attack' | 'legitimate'; category: string; expected: string; shipment: { commodity: string; quantity: string; seller: { legalName: string } } }
interface Result { scenario: string; contestant: string; verdict: 'RELEASE' | 'HOLD' | 'BLOCK' | null; cost_uusdc?: string; purchases?: number }
interface Prices { asOf: string; basis: string; note: string; commodities: Record<string, { usdPerTonne: number; basis: string; source: string }> }

const prices = JSON.parse(await readFile(resolve(DIR, 'prices.json'), 'utf8')) as Prices;
const cases = (await readFile(resolve(DIR, 'scenarios.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as Case);
const results = (await readFile(resolve(DIR, 'results.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as Result);
const verdict = (contestant: string, scenario: string) => results.find((r) => r.contestant === contestant && r.scenario === scenario);

function paperValue(c: Case): number {
  const price = prices.commodities[c.shipment.commodity];
  const tonnes = Number(/^([\d.]+)\s*t$/.exec(c.shipment.quantity)?.[1]);
  if (!price || !Number.isFinite(tonnes)) throw new Error(`No paper price for ${c.shipment.quantity} of ${c.shipment.commodity}.`);
  return Math.round(tonnes * price.usdPerTonne);
}

const rows = cases.map((c) => {
  const triad = verdict('triad', c.name);
  return {
    scenario: c.name, kind: c.kind, category: c.category, seller: c.shipment.seller.legalName, commodity: c.shipment.commodity, quantity: c.shipment.quantity,
    paperValueUsd: paperValue(c), triad: triad?.verdict ?? null, baseline: verdict('baseline', c.name)?.verdict ?? null,
    spendUsdc: Number(triad?.cost_uusdc ?? 0) / 1e6, purchases: triad?.purchases ?? 0,
  };
});

const sum = (list: typeof rows) => list.reduce((n, r) => n + r.paperValueUsd, 0);
const attacks = rows.filter((r) => r.kind === 'attack');
const legitimate = rows.filter((r) => r.kind === 'legitimate');
const outcome = (who: 'triad' | 'baseline') => {
  const released = attacks.filter((r) => r[who] === 'RELEASE');
  const blocked = legitimate.filter((r) => r[who] === 'BLOCK');
  const held = legitimate.filter((r) => r[who] === 'HOLD' && cases.find((c) => c.name === r.scenario)!.expected === 'CLEAR');
  return {
    attacksReleased: released.length, paperLossUsd: sum(released),
    legitimateBlocked: blocked.length, legitimateBlockedUsd: sum(blocked),
    legitimateHeldInsteadOfCleared: held.length, legitimateHeldUsd: sum(held),
  };
};
const triad = outcome('triad');
const baseline = outcome('baseline');
const spendUsdc = rows.reduce((n, r) => n + r.spendUsdc, 0);
const lossAvoidedUsd = baseline.paperLossUsd - triad.paperLossUsd;
const paid = rows.filter((r) => r.purchases > 0).map((r) => r.spendUsdc / r.paperValueUsd).sort((a, b) => a - b);

const report = {
  basis: prices.basis, pricesAsOf: prices.asOf, note: prices.note,
  spend: { usdc: Number(spendUsdc.toFixed(2)), answers: rows.reduce((n, r) => n + r.purchases, 0), currency: 'test USDC (Solana devnet, x402)' },
  attacks: { count: attacks.length, paperValueUsd: sum(attacks) },
  legitimate: { count: legitimate.length, paperValueUsd: sum(legitimate) },
  triad, baseline,
  lossAvoidedVsBaselineUsd: lossAvoidedUsd,
  lossAvoidedPerUsdc: Math.round(lossAvoidedUsd / spendUsdc),
  medianSpendPerMillionUsd: Number(((paid[Math.floor(paid.length / 2)] ?? 0) * 1e6).toFixed(3)),
  prices: prices.commodities,
  cases: rows,
};
await writeFile(resolve(DIR, 'roi.json'), JSON.stringify(report, null, 2) + '\n');
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
console.log(`Paper value: attacks ${usd(report.attacks.paperValueUsd)}, legitimate ${usd(report.legitimate.paperValueUsd)} (prices of ${prices.asOf})`);
console.log(`Triad: ${triad.attacksReleased} attacks released (${usd(triad.paperLossUsd)}), ${triad.legitimateBlocked} genuine blocked, ${triad.legitimateHeldInsteadOfCleared} held (${usd(triad.legitimateHeldUsd)})`);
console.log(`Baseline: ${baseline.attacksReleased} attacks released (${usd(baseline.paperLossUsd)}), ${baseline.legitimateBlocked} genuine blocked (${usd(baseline.legitimateBlockedUsd)})`);
console.log(`Intelligence: ${report.spend.usdc} test USDC for ${report.spend.answers} answers; loss avoided vs the baseline ${usd(lossAvoidedUsd)}, ${usd(report.lossAvoidedPerUsdc)} per test USDC; median ${report.medianSpendPerMillionUsd} USDC of checks per $1m of cargo`);
