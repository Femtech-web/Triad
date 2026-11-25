import { NextResponse } from 'next/server';
import { decisions, evidenceByHash } from '@/lib/data';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return decisions().map((d) => ({ hash: d.evidence_sha256 }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const stored = evidenceByHash((await params).hash);
  if (!stored) return NextResponse.json({ error: 'No recorded evidence has this hash.' }, { status: 404 });
  return NextResponse.json({ evidence_sha256: stored.evidence_sha256, evidence: stored.evidence });
}
