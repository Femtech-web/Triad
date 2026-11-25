import { z } from 'zod';
import { runLive } from '@/lib/server/console';
import { handle } from '@/lib/server/http';

export const runtime = 'nodejs';
export const maxDuration = 180;

const body = z.object({ case: z.string().max(80), instruction: z.unknown() });

export async function POST(request: Request) {
  return handle(request, 'decide', 6, async (json, progress) => {
    const { case: name, instruction } = body.parse(json);
    return runLive(name, instruction, progress);
  });
}
