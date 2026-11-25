import { NextResponse } from 'next/server';
import { evidenceByHash } from '@/lib/data';
import { sharedEvidence } from '@/lib/server/ledger';
import { attest } from '@/lib/server/runtime';

// Attest only in the deployed runtime; production signing secrets are not
// available to the prebuilt deployment's local static-generation step.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const hash = (await params).hash;
  const stored = evidenceByHash(hash);
  if (stored) return NextResponse.json({ evidence_sha256: stored.evidence_sha256, evidence: stored.evidence, attestation: await attest(stored.evidence_sha256) });
  const shared = await sharedEvidence(hash);
  if (shared) return NextResponse.json(shared);
  return NextResponse.json({ error: 'No recorded or shared evidence has this hash.' }, { status: 404 });
}
