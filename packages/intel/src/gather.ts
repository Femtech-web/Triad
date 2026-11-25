import type { CheckOutcome, CheckRequest, SourceAnswer } from '@triad/core';
import type { MinerDirectory } from './directory.js';
import { interpret, KEY_FIELD } from './interpret.js';
import type { SdnList } from './ofac.js';
import type { TelegraphClient } from './telegraph/client.js';

// Runs a purchase plan. Required checks are asked twice (ranked routing, then the best other Miner), sanctions are
// also matched against OFAC's list, and the answers are reduced to one outcome per check.

export interface GatherOptions {
  telegraph: TelegraphClient;
  directory: MinerDirectory | null;
  sdn: SdnList | null;
  concurrency?: number;
  callTimeoutMs?: number;
  // Called as each check completes, so a caller can show answers as they land.
  onOutcome?: (outcome: CheckOutcome) => void;
}

// Which failure explains a check best when no source answered usably.
const FAILURE_ORDER: SourceAnswer['status'][] = ['wrong_entity', 'unbound', 'unreadable', 'unavailable'];

async function askSource(check: CheckRequest, options: GatherOptions, minerId?: string): Promise<SourceAnswer> {
  const result = await options.telegraph.ask(check.intent, check.params, { ...(minerId ? { minerId } : {}), signal: AbortSignal.timeout(options.callTimeoutMs ?? 60_000) });
  if (result.status === 'delivered') return interpret(check, result.delivery);
  return { kind: 'telegraph', name: minerId ? `Miner ${minerId}` : 'Ranked routing', status: 'unavailable', fields: {}, detail: result.reason, purchase: null };
}

export function consolidate(check: CheckRequest, sources: SourceAnswer[]): CheckOutcome {
  const key = KEY_FIELD[check.check];
  const base = { checkId: check.id, sources };
  const official = sources.find((s) => s.kind === 'official');
  if (official && official.fields.matched === true) {
    const missed = sources.filter((s) => s.kind === 'telegraph' && s.status === 'answered' && s.fields.matched === false).map((s) => s.name);
    return { ...base, status: 'answered', fields: official.fields, detail: `${official.detail}${missed.length ? ` ${missed.join(' and ')} said no match.` : ''}` };
  }
  const usable = sources.filter((s) => s.status === 'answered');
  if (!usable.length) {
    const worst = FAILURE_ORDER.find((status) => sources.some((s) => s.status === status)) ?? 'unavailable';
    return { ...base, status: worst, fields: {}, detail: sources.map((s) => s.detail).join(' ') || 'No source answered.' };
  }
  const values = new Map(usable.map((s) => [JSON.stringify(s.fields[key] ?? null), s]));
  if (values.size > 1) {
    return { ...base, status: 'conflict', fields: {}, detail: usable.map((s) => `${s.name}: ${String(s.fields[key])}`).join('; ') };
  }
  const telegraphCount = usable.filter((s) => s.kind === 'telegraph').length;
  const fields = Object.assign({}, ...usable.slice().reverse().map((s) => s.fields), { sources_agreeing: usable.length }) as Record<string, unknown>;
  const corroboration = usable.length > 1 ? `${usable.length} sources agree` : telegraphCount ? 'one source' : 'official list only';
  return { ...base, status: 'answered', fields, detail: `${usable[0]!.detail} (${corroboration})` };
}

export async function gatherOne(check: CheckRequest, options: GatherOptions): Promise<CheckOutcome> {
  const sources: SourceAnswer[] = [await askSource(check, options)];
  if (check.required && options.directory) {
    const second = options.directory.secondSource(check.intent, [sources[0]!.purchase?.minerId ?? null]);
    if (second) sources.push(await askSource(check, options, second.id));
  }
  if (check.check === 'sanctions' && options.sdn && (check.subject.kind === 'entity' || check.subject.kind === 'vessel')) {
    sources.push(options.sdn.answer(check.subject.kind === 'vessel' ? { kind: 'vessel', name: check.subject.name, imo: check.subject.imo } : { kind: 'entity', name: check.subject.name }));
  }
  return consolidate(check, sources);
}

export async function gather(plan: CheckRequest[], options: GatherOptions): Promise<CheckOutcome[]> {
  const outcomes: CheckOutcome[] = new Array(plan.length);
  let next = 0;
  const worker = async () => {
    while (next < plan.length) {
      const index = next++;
      outcomes[index] = await gatherOne(plan[index]!, options);
      options.onOutcome?.(outcomes[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 3, plan.length) }, worker));
  return outcomes;
}
