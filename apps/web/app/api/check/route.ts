import { runCheck } from '@/lib/server/console';
import { handle } from '@/lib/server/http';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: Request) {
  return handle(request, 'check', 8, (json) => runCheck(json));
}
