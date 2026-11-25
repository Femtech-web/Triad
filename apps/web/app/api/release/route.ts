import { z } from 'zod';
import type { EvidenceFile } from '@triad/evidence';
import { releaseOnSepolia } from '@/lib/server/console';
import { handle } from '@/lib/server/http';

export const runtime = 'nodejs';
export const maxDuration = 300;

const body = z.object({
  evidence: z.record(z.string(), z.unknown()),
  evidence_sha256: z.string().regex(/^0x[0-9a-f]{64}$/i),
  seal: z.string().max(64),
  rail: z.literal('sepolia'),
});

export async function POST(request: Request) {
  return handle(request, 'release', 4, async (json) => {
    const { evidence, evidence_sha256, seal } = body.parse(json);
    return releaseOnSepolia({ evidence: evidence as unknown as EvidenceFile, evidence_sha256, seal });
  });
}
