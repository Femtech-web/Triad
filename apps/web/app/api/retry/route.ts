import { z } from 'zod';
import type { EvidenceFile } from '@triad/evidence';
import { retryMissing } from '@/lib/server/console';
import { handle } from '@/lib/server/http';

export const runtime = 'nodejs';
export const maxDuration = 180;

const body = z.object({ evidence: z.record(z.string(), z.unknown()), evidence_sha256: z.string().regex(/^0x[0-9a-f]{64}$/i), seal: z.string().max(64).optional() });

export async function POST(request: Request) {
  return handle(request, 'retry', 8, async (json, progress) => {
    const { evidence, evidence_sha256, seal } = body.parse(json);
    return retryMissing({ evidence: evidence as unknown as EvidenceFile, evidence_sha256, ...(seal ? { seal } : {}) }, progress);
  });
}
