import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EvidenceView } from '@/components/evidence-view';
import { decisions, evidenceByHash, releasesFor } from '@/lib/data';
import { short } from '@/lib/format';
import s from '../evidence.module.css';

export const dynamicParams = false;
export function generateStaticParams() {
  return decisions().map((d) => ({ hash: d.evidence_sha256 }));
}

export async function generateMetadata({ params }: { params: Promise<{ hash: string }> }): Promise<Metadata> {
  const stored = evidenceByHash((await params).hash);
  return { title: stored ? `${stored.evidence.decision.decision} · ${stored.evidence.provenance.scenario} · Triad` : 'Evidence · Triad' };
}

export default async function EvidencePage({ params }: { params: Promise<{ hash: string }> }) {
  const stored = evidenceByHash((await params).hash);
  if (!stored) notFound();
  const released = releasesFor(stored.evidence_sha256);
  const scenario = stored.evidence.provenance.scenario;
  return (
    <section className={`wrap ${s.detail}`}>
      <p className={s.crumbs}><Link href="/evidence">Evidence</Link> / <span className="mono">{short(stored.evidence_sha256)}</span></p>
      <EvidenceView evidence={stored.evidence} hash={stored.evidence_sha256} />
      <div className={s.actions}>
        <a className="btn ghost" href={`/api/evidence/${stored.evidence_sha256}`} download={`triad-${stored.evidence_sha256.slice(2, 14)}.json`}>Download the file</a>
        {scenario && <Link className="btn ghost" href={`/console?case=${encodeURIComponent(scenario)}`}>Open this case in the console</Link>}
      </div>
      {released.map((r) => (
        <div key={r.transaction} className={`doc ${s.released}`}>
          <div className="doc-head"><span className="doc-title">Released against this file</span><span className="kicker">{r.rail}</span></div>
          <div className="doc-body">
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
