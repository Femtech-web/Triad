import { NextResponse } from 'next/server';
import { decisions, evidenceByHash } from '@/lib/data';
import { sharedEvidence } from '@/lib/server/ledger';
import { attest } from '@/lib/server/runtime';

export const revalidate = 3600;

export function generateStaticParams() {
  return decisions().map((d) => ({ hash: d.evidence_sha256 }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const hash = (await params).hash;
  const stored = evidenceByHash(hash);
  if (stored) return NextResponse.json({ evidence_sha256: stored.evidence_sha256, evidence: stored.evidence, attestation: await attest(stored.evidence_sha256) });
  const shared = await sharedEvidence(hash);
  if (shared) return NextResponse.json(shared);
  return NextResponse.json({ error: 'No recorded or shared evidence has this hash.' }, { status: 404 });
}
