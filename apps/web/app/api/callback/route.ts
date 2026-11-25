import { z } from 'zod';
import type { EvidenceFile } from '@triad/evidence';
import { answerCallback } from '@/lib/server/console';
import { handle } from '@/lib/server/http';

export const runtime = 'nodejs';

const body = z.object({
  evidence: z.record(z.string(), z.unknown()),
  evidence_sha256: z.string().regex(/^0x[0-9a-f]{64}$/i),
  seal: z.string().max(64).optional(),
  outcome: z.enum(['confirmed', 'denied']),
});

export async function POST(request: Request) {
  return handle(request, 'callback', 40, async (json) => {
    const { evidence, evidence_sha256, seal, outcome } = body.parse(json);
    return answerCallback({ evidence: evidence as unknown as EvidenceFile, evidence_sha256, outcome, ...(seal ? { seal } : {}) });
  });
}
