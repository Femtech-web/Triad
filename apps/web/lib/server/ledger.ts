import 'server-only';
import type { Attestation, EvidenceFile } from '@triad/evidence/canonical';
import { store } from './store';

// The public ledger: every decision the app issues, reduced to what is safe to publish. Never a name, an email, a phone
// number or an account: only the surface, the verdict, the rules that fired, what was bought, when, and the hash.
// The full evidence file is published only when the person who ran the decision chooses to share it.

export type Surface = 'check' | 'lab';
export type Step = 'decision' | 'callback' | 'retry';
export interface LedgerEntry {
  at: string; surface: Surface; step: Step; decision: 'CLEAR' | 'HOLD' | 'BLOCK'; needs: string[]; rules: string[];
  purchases: number; costUusdc: string; rails: string[]; hash: string;
}
export interface SharedEvidence { evidence_sha256: string; evidence: EvidenceFile; attestation: Attestation | null; sharedAt: string }

// Newest first in name order, with the summary in the name so counting needs one listing, not a read per entry.
const EPOCH_END = 9_999_999_999_999;
const entryPath = (e: LedgerEntry) =>
  `ledger/${String(EPOCH_END - Date.parse(e.at)).padStart(13, '0')}_${e.surface}_${e.step}_${e.decision}_${e.purchases}_${e.costUusdc}_${e.hash.slice(2, 18)}.json`;
function parseName(path: string) {
  const [inv, surface, step, decision, purchases, cost] = path.slice('ledger/'.length, -'.json'.length).split('_');
  return { at: new Date(EPOCH_END - Number(inv)).toISOString(), surface: surface as Surface, step: step as Step, decision: decision as LedgerEntry['decision'], purchases: Number(purchases), costUusdc: Number(cost) };
}

// `spent` is what this step bought; by default the whole file's purchases, and nothing for a callback.
export async function recordDecision(evidence: EvidenceFile, hash: string, surface: Surface, step: Step, spent?: { purchases: number; uusdc: bigint }): Promise<void> {
  if (!store) return;
  const purchases = evidence.outcomes.flatMap((o) => o.sources.flatMap((s) => (s.purchase ? [s.purchase] : [])));
  const entry: LedgerEntry = {
    at: new Date().toISOString(), surface, step, decision: evidence.decision.decision, needs: evidence.decision.needs,
    rules: [...new Set(evidence.decision.hits.map((h) => h.rule))],
    purchases: spent?.purchases ?? (step === 'callback' ? 0 : evidence.cost.purchases),
    costUusdc: spent ? spent.uusdc.toString() : step === 'callback' ? '0' : evidence.cost.telegraphUusdc, rails: [...new Set(purchases.map((p) => p.rail))], hash,
  };
  try { await store.put(entryPath(entry), JSON.stringify(entry)); }
  catch (error) { console.error('[ledger] not recorded', (error as Error).message); }
}

export async function shareEvidence(shared: Omit<SharedEvidence, 'sharedAt'>): Promise<boolean> {
  if (!store) return false;
  await store.put(`evidence/${shared.evidence_sha256.toLowerCase()}.json`, JSON.stringify({ ...shared, sharedAt: new Date().toISOString() }));
  ledgerCache = null;
  return true;
}

export async function sharedEvidence(hash: string): Promise<SharedEvidence | null> {
  if (!store || !/^0x[0-9a-f]{64}$/i.test(hash)) return null;
  const text = await store.read(`evidence/${hash.toLowerCase()}.json`);
  return text ? (JSON.parse(text) as SharedEvidence) : null;
}

export interface LedgerView {
  enabled: boolean;
  stats: { decisions: number; byDecision: Record<string, number>; bySurface: Record<string, number>; callbacks: number; paidAnswers: number; spendUsdc: number; last24h: number; since: string | null };
  recent: (LedgerEntry & { shared: boolean })[];
}

let ledgerCache: { at: number; view: Promise<LedgerView> } | null = null;
export function readLedger(): Promise<LedgerView> {
  if (!ledgerCache || Date.now() - ledgerCache.at > 30_000) ledgerCache = { at: Date.now(), view: build() };
  return ledgerCache.view;
}

async function build(): Promise<LedgerView> {
  const empty: LedgerView = { enabled: Boolean(store), stats: { decisions: 0, byDecision: {}, bySurface: {}, callbacks: 0, paidAnswers: 0, spendUsdc: 0, last24h: 0, since: null }, recent: [] };
  if (!store) return empty;
  try {
    const [names, sharedNames] = await Promise.all([store.list('ledger/', 5000), store.list('evidence/', 5000)]);
    const shared = new Set(sharedNames.map((n) => n.slice('evidence/'.length, -'.json'.length)));
    const rows = names.map(parseName);
    const count = (key: 'decision' | 'surface') => rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r[key]]: (m[r[key]] ?? 0) + 1 }), {});
    const recent = (await Promise.all(names.slice(0, 40).map(async (n) => { const t = await store!.read(n); return t ? (JSON.parse(t) as LedgerEntry) : null; })))
      .filter((e): e is LedgerEntry => e !== null).map((e) => ({ ...e, shared: shared.has(e.hash.toLowerCase()) }));
    return {
      enabled: true,
      stats: {
        decisions: rows.filter((r) => r.step !== 'callback').length, byDecision: count('decision'), bySurface: count('surface'),
        callbacks: rows.filter((r) => r.step === 'callback').length, paidAnswers: rows.reduce((n, r) => n + r.purchases, 0),
        spendUsdc: rows.reduce((n, r) => n + r.costUusdc, 0) / 1e6, last24h: rows.filter((r) => Date.now() - Date.parse(r.at) < 86_400_000).length,
        since: rows.at(-1)?.at ?? null,
      },
      recent,
    };
  } catch (error) {
    console.error('[ledger] unreadable', (error as Error).message);
    return empty;
  }
}
