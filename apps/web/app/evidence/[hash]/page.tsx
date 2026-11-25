import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EvidenceView } from '@/components/evidence-view';
import { evidenceByHash, releasesFor } from '@/lib/data';
import { sharedEvidence } from '@/lib/server/ledger';
import { attest, issuerAddress } from '@/lib/server/runtime';
import { noteSerial } from '@/lib/gates';
import s from '../evidence.module.css';

// Signing keys exist only in the deployment runtime, never in the local build.
// Both recorded and shared evidence must therefore be rendered per request.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function find(hash: string) {
  const stored = evidenceByHash(hash);
  if (stored) return { ...stored, attestation: await attest(stored.evidence_sha256), sharedAt: null };
  const shared = await sharedEvidence(hash);
  return shared ? { ...shared, attestation: shared.attestation ?? (await attest(shared.evidence_sha256)) } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ hash: string }> }): Promise<Metadata> {
  const stored = await find((await params).hash);
  return { title: stored ? `${stored.evidence.decision.decision} · ${stored.evidence.provenance.scenario === 'check' ? 'A payment check' : stored.evidence.provenance.scenario} · Triad` : 'Evidence · Triad' };
}

export default async function EvidencePage({ params }: { params: Promise<{ hash: string }> }) {
  const stored = await find((await params).hash);
  if (!stored) notFound();
  const released = releasesFor(stored.evidence_sha256);
  const scenario = stored.evidence.provenance.scenario;
  return (
    <section className={`wrap ${s.detail}`}>
      <p className={s.crumbs}><Link href="/evidence">Notes</Link> / <span className="mono">{noteSerial(stored.evidence_sha256)}</span>{stored.sharedAt && <> · shared {stored.sharedAt.slice(0, 16).replace('T', ' ')} UTC by the person who ran it</>}</p>
      <EvidenceView evidence={stored.evidence} hash={stored.evidence_sha256} attestation={stored.attestation} issuer={issuerAddress()} />
      <div className={s.actions}>
        <a className="btn secondary" href={`/api/evidence/${stored.evidence_sha256}`} download={`triad-${stored.evidence_sha256.slice(2, 14)}.json`}>Download the note</a>
        {scenario && <Link className="btn secondary" href={`/console?case=${encodeURIComponent(scenario)}`}>Open this case in the attack lab</Link>}
      </div>
      {released.map((r) => (
        <div key={r.transaction} className={`card ${s.released}`}>
          <div className="card-head"><span className="card-title">Released against this file</span><span className="chip clear">{r.rail}</span></div>
          <div className="card-body">
            <dl className="fields">
              <dt>Transaction</dt><dd><a className="mono" href={r.explorer} target="_blank" rel="noreferrer">{r.transaction}</a></dd>
              <dt>Escrow</dt><dd className="mono">{r.escrow}</dd>
              <dt>Payee</dt><dd className="mono">{r.authorization.payee}</dd>
              <dt>Signed by</dt><dd className="mono">{r.authorization.signer}</dd>
              <dt>At</dt><dd className="mono">{r.releasedAt.slice(0, 19).replace('T', ' ')} UTC</dd>
            </dl>
          </div>
        </div>
      ))}
    </section>
  );
}
