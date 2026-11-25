import { z } from 'zod';

// Who serves an Intent and how they rank, so a required check can be asked of a second, independent Miner.
// The leaderboard lists only the Intents scored in the current epoch, so ranks come from each Miner's own latest score.

export interface RankedMiner { id: string; slug: string; name: string; epoch: number | null; rank: number | null; score: number | null }
export interface MinerDirectory {
  ranked(intent: string): RankedMiner[];
  // The best-ranked active Miner not already asked, preferring one with a positive score.
  secondSource(intent: string, exclude: (string | null)[]): RankedMiner | null;
}

const minerSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  slug: z.string(),
  name: z.string().optional(),
  activation_status: z.string().optional(),
  supported_intents: z.array(z.string()).optional(),
  scores: z.array(z.object({ intent_id: z.string(), epoch_id: z.number().int(), rank: z.number().int(), score: z.number() }).passthrough()).nullable().optional(),
}).passthrough();
const minersSchema = z.union([z.array(minerSchema), z.object({ miners: z.array(minerSchema) }).passthrough().transform((o) => o.miners)]);

export function buildDirectory(miners: unknown): MinerDirectory {
  const active = minersSchema.parse(miners).filter((m) => (m.activation_status ?? 'active') === 'active');
  const ranked = (intent: string): RankedMiner[] => {
    const serving = active.filter((m) => m.supported_intents?.includes(intent) || m.scores?.some((s) => s.intent_id === intent)).map((m) => {
      const latest = (m.scores ?? []).filter((s) => s.intent_id === intent).sort((a, b) => b.epoch_id - a.epoch_id)[0];
      return { id: m.id, slug: m.slug, name: m.name ?? m.slug, epoch: latest?.epoch_id ?? null, rank: latest?.rank ?? null, score: latest?.score ?? null };
    });
    // Ranks are comparable only within one epoch: the latest scored epoch first by rank, then older scores, then unscored.
    return serving.sort((a, b) => (b.epoch ?? -1) - (a.epoch ?? -1) || (a.rank ?? Infinity) - (b.rank ?? Infinity) || (b.score ?? -1) - (a.score ?? -1));
  };
  return {
    ranked,
    secondSource(intent, exclude) {
      const candidates = ranked(intent).filter((m) => !exclude.includes(m.id));
      return candidates.find((m) => (m.score ?? 0) > 0) ?? candidates[0] ?? null;
    },
  };
}

export async function loadDirectory(node: string, transport: typeof fetch = fetch, signal: AbortSignal = AbortSignal.timeout(30_000)): Promise<MinerDirectory> {
  const response = await transport(`${node}/api/miners`, { signal, redirect: 'error' });
  if (!response.ok) throw new Error(`Telegraph /api/miners returned HTTP ${response.status}.`);
  return buildDirectory(await response.json());
}
