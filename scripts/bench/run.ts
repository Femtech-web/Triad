// Triad's frozen benchmark (benchmark/triad-v1). Resumable and journaled; refuses to run if the case file changed.
//   tsx scripts/bench/run.ts triad [--rail solana|sepolia] [--limit N] [--send]   Triad live, and the baseline from the same answers
//     (a case whose required checks got no delivered answer is not recorded; --record-failures records it anyway)
//   tsx scripts/bench/run.ts frontier [--limit N] [--send]                        the frontier model (FRONTIER_* in .env)
//   tsx scripts/bench/run.ts grade                                                score the journal, write report.json and report.md
import '@triad/intel/dns';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decide, detectChanges, planChecks } from '@triad/core';
import type { CallbackResult } from '@triad/core';
import { buildEvidence, evidenceHash } from '@triad/evidence';
import { createEscrowClient, createEscrowTelegraphClient, createX402SolanaTelegraphClient, gather, loadDirectory, loadSdnListCached, TELEGRAPH_TESTNET } from '@triad/intel';
import type { TelegraphClient } from '@triad/intel';
import { loadEvmAccount, loadSolanaSigner, SOLANA_DEVNET_RPC } from '../../apps/cli/src/keys.js';
import { askFrontier, baselineVerdict, frontierCaseFile, FRONTIER_QUOTA_EXHAUSTED } from './contestants.js';
import type { Verdict } from './contestants.js';
import type { BenchmarkCase } from './freeze.js';

const ROOT = resolve(import.meta.dirname, '../..');
const DIR = resolve(ROOT, 'benchmark/triad-v1');
const JOURNAL = resolve(DIR, 'results.jsonl');
const PRICE_UUSDC = 10_000n;
const option = (flag: string) => { const at = process.argv.indexOf(flag); return at >= 0 ? process.argv[at + 1] : undefined; };

interface Result {
  scenario: string; contestant: 'triad' | 'baseline' | 'frontier';
  verdict: Verdict | null; decision?: string; needs?: string[]; rules?: string[]; reason?: string;
  evidence_sha256?: string; cost_uusdc?: string; purchases?: number; latency_ms: number; at: string;
}

async function load(): Promise<BenchmarkCase[]> {
  const [text, manifest] = await Promise.all([readFile(resolve(DIR, 'scenarios.jsonl'), 'utf8'), readFile(resolve(DIR, 'manifest.json'), 'utf8').then((m) => JSON.parse(m) as { scenariosSha256: string })]);
  if (createHash('sha256').update(text).digest('hex') !== manifest.scenariosSha256) throw new Error('scenarios.jsonl differs from its frozen manifest; refusing.');
  return text.trim().split('\n').map((l) => JSON.parse(l) as BenchmarkCase);
}
async function journal(): Promise<Result[]> {
  try { return (await readFile(JOURNAL, 'utf8')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Result); } catch { return []; }
}
const record = (r: Result) => appendFile(JOURNAL, JSON.stringify(r) + '\n');
const toVerdict = (decision: string): Verdict => (decision === 'CLEAR' ? 'RELEASE' : decision === 'BLOCK' ? 'BLOCK' : 'HOLD');

async function runTriad(cases: BenchmarkCase[], send: boolean) {
  const done = new Set((await journal()).filter((r) => r.contestant === 'triad').map((r) => r.scenario));
  const pending = cases.filter((c) => !done.has(c.name)).slice(0, Number(option('--limit') ?? Infinity));
  const plans = pending.map((c) => planChecks(c.shipment, detectChanges(c.shipment, c.instruction)));
  const maxCalls = plans.flat().reduce((n, c) => n + (c.required ? 2 : 1), 0);
  console.log(JSON.stringify({ pending: pending.length, maxPaidCalls: maxCalls, maxTestUsdc: Number(BigInt(maxCalls) * PRICE_UUSDC) / 1e6 }));
  if (!send) return;
  const rail = option('--rail') ?? 'solana';
  const budget = BigInt(maxCalls) * PRICE_UUSDC;
  const telegraph: TelegraphClient = rail === 'solana'
    ? createX402SolanaTelegraphClient({ signer: await loadSolanaSigner(resolve(ROOT, '.secrets/solana-operator.json')), rpcUrl: SOLANA_DEVNET_RPC, maxTotalUusdc: budget })
    : createEscrowTelegraphClient(createEscrowClient({
      policy: { node: TELEGRAPH_TESTNET.node, network: TELEGRAPH_TESTNET.sepolia.network, diamond: TELEGRAPH_TESTNET.sepolia.diamond, maxCallUusdc: TELEGRAPH_TESTNET.maxCallUusdc },
      signer: await (async () => { const a = await loadEvmAccount(resolve(ROOT, '.secrets/evm-operator.json')); return { address: a.address, signMessage: (message: string) => a.signMessage({ message }) }; })(),
      maxTotalUusdc: budget,
    }));
  const [directory, sdn] = await Promise.all([loadDirectory(TELEGRAPH_TESTNET.node), loadSdnListCached(resolve(ROOT, '.cache/ofac'))]);
  await mkdir(resolve(DIR, 'evidence'), { recursive: true });
  for (const c of pending) {
    const started = Date.now();
    const changeSet = detectChanges(c.shipment, c.instruction);
    const plan = planChecks(c.shipment, changeSet);
    const outcomes = await gather(plan, { telegraph, directory, sdn, concurrency: 2 });
    // A rate limit or an outage is not an answer, so it is not scored: a case is recorded only when every required check
    // got at least one delivered Telegraph answer. Otherwise the run stops, to resume later.
    const starved = plan.filter((p) => p.required && !outcomes.find((o) => o.checkId === p.id)?.sources.some((s) => s.kind === 'telegraph' && s.purchase));
    if (starved.length && !process.argv.includes('--record-failures')) {
      const why = outcomes.flatMap((o) => o.sources).find((s) => s.kind === 'telegraph' && !s.purchase)?.detail ?? 'no answer';
      console.log(`${c.name}: no delivered answer for ${starved.map((p) => p.id).join(', ')} (${why}); nothing recorded, resume later.`);
      return;
    }
    const decision = decide({ shipment: c.shipment, instruction: c.instruction, changeSet, plan, outcomes, ...(c.callback ? { callback: c.callback as CallbackResult } : {}) });
    const evidence = buildEvidence({ provenance: { scenario: c.name, synthetic: c.synthetic, network: 'testnet' }, shipment: c.shipment, instruction: c.instruction, changeSet, plan, outcomes, decision });
    const hash = evidenceHash(evidence);
    await writeFile(resolve(DIR, 'evidence', `${c.name}.json`), JSON.stringify({ evidence_sha256: hash, evidence }, null, 2) + '\n');
    const latency = Date.now() - started;
    const at = new Date().toISOString();
    await record({ scenario: c.name, contestant: 'triad', verdict: toVerdict(decision.decision), decision: decision.decision, needs: decision.needs, rules: decision.hits.map((h) => h.rule),
      evidence_sha256: hash, cost_uusdc: evidence.cost.telegraphUusdc, purchases: evidence.cost.purchases, latency_ms: latency, at });
    const baseline = baselineVerdict(plan, outcomes);
    await record({ scenario: c.name, contestant: 'baseline', verdict: baseline.verdict, reason: baseline.reason, latency_ms: latency, at });
    console.log(`${c.name.padEnd(48)} triad ${decision.decision.padEnd(5)} baseline ${baseline.verdict.padEnd(7)} ${evidence.cost.purchases} buys ${(latency / 1000).toFixed(1)}s`);
  }
}

async function runFrontier(cases: BenchmarkCase[], send: boolean) {
  const config = { apiKey: process.env.FRONTIER_API_KEY ?? '', model: process.env.FRONTIER_MODEL ?? '', baseUrl: process.env.FRONTIER_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai' };
  const done = new Set((await journal()).filter((r) => r.contestant === 'frontier').map((r) => r.scenario));
  const pending = cases.filter((c) => !done.has(c.name)).slice(0, Number(option('--limit') ?? Infinity));
  console.log(JSON.stringify({ pending: pending.length, model: config.model || '(FRONTIER_MODEL unset)' }));
  if (!send) return;
  if (!config.apiKey || !config.model) throw new Error('Set FRONTIER_API_KEY and FRONTIER_MODEL in .env.');
  for (const c of pending) {
    const started = Date.now();
    try {
      const answer = await askFrontier(config, frontierCaseFile(c.shipment, c.instruction, c.callback));
      await record({ scenario: c.name, contestant: 'frontier', verdict: answer.verdict, reason: `${config.model}: ${answer.reason}`, latency_ms: Date.now() - started, at: new Date().toISOString() });
      console.log(`${c.name.padEnd(48)} ${answer.verdict ?? 'unreadable'}`);
    } catch (error) {
      // Neither a spent quota nor an overloaded provider is an answer: nothing is recorded, so the case is asked again later.
      const message = (error as Error).message;
      console.log(message === FRONTIER_QUOTA_EXHAUSTED ? `Daily quota reached at ${c.name}; resume after the provider's reset.` : `${c.name}: ${message}; stopping, resume later.`);
      return;
    }
    await new Promise((r) => setTimeout(r, 8_000));
  }
}

async function grade(cases: BenchmarkCase[]) {
  const results = await journal();
  const byName = new Map(cases.map((c) => [c.name, c]));
  const contestants = ['triad', 'baseline', 'frontier'] as const;
  const released = (v: Verdict | null) => v === 'RELEASE';
  const toDecision = (v: Verdict | null) => (v === 'RELEASE' ? 'CLEAR' : v);
  const summary = contestants.map((name) => {
    const mine = results.filter((r) => r.contestant === name && byName.has(r.scenario));
    const attacks = mine.filter((r) => byName.get(r.scenario)!.kind === 'attack');
    const legit = mine.filter((r) => byName.get(r.scenario)!.kind === 'legitimate');
    const cost = mine.reduce((n, r) => n + Number(r.cost_uusdc ?? 0), 0);
    return {
      contestant: name, answered: mine.length,
      attacks: attacks.length, attacksReleased: attacks.filter((r) => released(r.verdict)).map((r) => r.scenario),
      attacksStopped: attacks.filter((r) => !released(r.verdict) && r.verdict !== null).length,
      legitimate: legit.length,
      legitimateAsExpected: legit.filter((r) => toDecision(r.verdict) === byName.get(r.scenario)!.expected).length,
      legitimateBlocked: legit.filter((r) => r.verdict === 'BLOCK').map((r) => r.scenario),
      legitimateHeldInstead: legit.filter((r) => r.verdict === 'HOLD' && byName.get(r.scenario)!.expected === 'CLEAR').map((r) => r.scenario),
      exact: mine.filter((r) => toDecision(r.verdict) === byName.get(r.scenario)!.expected).length,
      ...(name === 'triad' ? { testUsdc: cost / 1e6, purchases: mine.reduce((n, r) => n + (r.purchases ?? 0), 0) } : {}),
    };
  });
  const outcomesIn = (name: string, category: string) => results.filter((r) => r.contestant === name && byName.get(r.scenario)?.category === category).map((r) => toDecision(r.verdict) ?? '?').join(' ');
  const categories = [...new Set(cases.map((c) => c.category))].map((category) => ({
    category, kind: cases.find((c) => c.category === category)!.kind, cases: cases.filter((c) => c.category === category).length,
    triad: outcomesIn('triad', category), baseline: outcomesIn('baseline', category), frontier: outcomesIn('frontier', category),
  }));
  await writeFile(resolve(DIR, 'report.json'), JSON.stringify({ gradedAt: new Date().toISOString(), summary, categories, results }, null, 2) + '\n');
  const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
  const md = [
    '# Triad benchmark v1: results', '',
    row(['Contestant', 'Cases answered', 'Attacks released', 'Attacks stopped', 'Legitimate as expected', 'Legitimate blocked', 'Legitimate held instead of cleared']),
    row(['---', '---', '---', '---', '---', '---', '---']),
    ...summary.map((s) => row([s.contestant, `${s.answered}/40`, `**${s.attacksReleased.length}**/${s.attacks}`, `${s.attacksStopped}/${s.attacks}`, `${s.legitimateAsExpected}/${s.legitimate}`, s.legitimateBlocked.length, s.legitimateHeldInstead.length])),
    '', '## By category', '',
    row(['Category', 'Kind', 'Cases', 'Triad', 'Baseline', 'Frontier']), row(['---', '---', '---', '---', '---', '---']),
    ...categories.map((c) => row([c.category, c.kind, c.cases, String(c.triad || '-'), String(c.baseline || '-'), String(c.frontier || '-')])),
    '', `Triad bought ${summary[0]!.purchases ?? 0} answers for ${summary[0]!.testUsdc ?? 0} test USDC.`, '',
  ].join('\n');
  await writeFile(resolve(DIR, 'report.md'), md);
  console.log(md);
}

const [command] = process.argv.slice(2);
const cases = await load();
if (command === 'triad') await runTriad(cases, process.argv.includes('--send'));
else if (command === 'frontier') await runFrontier(cases, process.argv.includes('--send'));
else if (command === 'grade') await grade(cases);
else throw new Error('Commands: triad | frontier | grade');
