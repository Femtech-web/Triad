import type { Metadata } from 'next';
import { consoleCases } from '@/lib/cases';
import { LiveUnavailable, operatorAccount, releaseOfficerAccount } from '@/lib/server/runtime';
import { Console } from './console';

export const metadata: Metadata = { title: 'Attack console · Triad' };
export const dynamic = 'force-dynamic';

function liveStatus(): { enabled: boolean; reason: string | null } {
  try {
    operatorAccount();
    releaseOfficerAccount();
    return { enabled: true, reason: null };
  } catch (error) {
    return { enabled: false, reason: error instanceof LiveUnavailable ? error.message : 'Live runs are not configured on this deployment.' };
  }
}

export default function ConsolePage() {
  return <Console cases={consoleCases()} live={liveStatus()} />;
}
