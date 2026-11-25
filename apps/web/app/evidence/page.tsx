import type { Metadata } from 'next';
import Link from 'next/link';
import { Stamp } from '@/components/stamp';
import { decisions, releases } from '@/lib/data';
import { short, usdc } from '@/lib/format';
import { DropVerify } from './drop-verify';
import s from './evidence.module.css';

export const metadata: Metadata = { title: 'Evidence · Triad' };

export default function EvidenceIndex() {
  const all = decisions().sort((a, b) => b.evidence.generatedAt.localeCompare(a.evidence.generatedAt));
  const released = new Map(releases().map((r) => [r.authorization.evidenceHash.toLowerCase(), r]));
  return (
    <>
      <section className={`wrap ${s.intro}`}>
        <p className="kicker rise">Evidence</p>
        <h1 className={`display rise d1 ${s.headline}`}>Every decision ships with its evidence file.</h1>
        <p className="lede rise d2">An evidence file holds the record, the instruction, every check bought with its Telegraph receipt, the OFAC snapshot it was screened against, and the decision with the rules that fired. It is canonical JSON, so its SHA-256 is the same wherever it is computed. A release signature names that hash, and the escrow stores it.</p>
      </section>

      <section className={`wrap ${s.drop}`}>
        <DropVerify />
      </section>

      <section className={`wrap ${s.table}`}>
        <h2 className="section">On record</h2>
        {all.length ? (
          <div className={s.scroll}>
            <table>
              <thead><tr><th>Decided</th><th>Case</th><th>Decision</th><th>Paid checks</th><th>Evidence</th><th>Released</th></tr></thead>
              <tbody>
                {all.map((d) => {
                  const release = released.get(d.evidence_sha256.toLowerCase());
                  return (
                    <tr key={d.file}>
                      <td className="mono">{d.evidence.generatedAt.slice(0, 16).replace('T', ' ')}</td>
                      <td>{d.evidence.provenance.scenario}</td>
                      <td><Stamp verdict={d.evidence.decision.decision} className={s.mini} /></td>
                      <td>{d.evidence.cost.purchases} · {usdc(d.evidence.cost.telegraphUusdc)}</td>
                      <td><Link className="mono" href={`/evidence/${d.evidence_sha256}`}>{short(d.evidence_sha256)}</Link></td>
                      <td>{release ? <a className="mono" href={release.explorer} target="_blank" rel="noreferrer">{short(release.transaction, 8, 4)}</a> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No decisions recorded yet.</p>}
      </section>
    </>
  );
}
