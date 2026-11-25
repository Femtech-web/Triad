import type { Metadata } from 'next';
import Link from 'next/link';
import { Verdict } from '@/components/verdict';
import { usdc } from '@/lib/format';
import { readLedger } from '@/lib/server/ledger';
import { operatorAccount } from '@/lib/server/runtime';
import { noteSerial } from '@/lib/gates';
import s from './ledger.module.css';

export const metadata: Metadata = { title: 'Ledger · Triad', description: 'Every decision the Triad app makes, in public: verdict, rules, cost, time and hash. Never a name, an email or an account.' };
export const dynamic = 'force-dynamic';

const SURFACE = { check: 'Payment check', lab: 'Attack lab' } as const;
const STEP = { decision: 'decision', callback: 'after the call', retry: 'after a retry' } as const;

function payer(): string | null {
  try { return operatorAccount().address; } catch { return null; }
}

export default async function LedgerPage() {
  const ledger = await readLedger();
  const { stats } = ledger;
  const operator = payer();
  return (
    <>
      <section className={`wrap ${s.intro}`}>
        <p className="label rise">Ledger</p>
        <h1 className={`display rise d1 ${s.headline}`}>Every decision, in public.</h1>
        <p className="lede rise d2">Each decision the app makes appears here as it happens: the verdict, the rules that fired, what was bought, when, and the evidence file’s hash. Never a name, an email, a phone number or an account. A full evidence file is published only when the person who ran it chooses <b>Share</b>.</p>
      </section>

      {!ledger.enabled ? (
        <section className="wrap"><p className={`card ${s.notice}`}>The ledger isn’t set up on this deployment.</p></section>
      ) : (
        <>
          <section className={`wrap rise d3 ${s.stats}`}>
            <div className={`card ${s.stat}`}><span className={s.statLabel}>Decisions made</span><span className={s.statValue}>{stats.decisions.toLocaleString('en-US')}</span><span className={s.statNote}>{stats.last24h} in the last 24 hours{stats.since ? ` · since ${stats.since.slice(0, 10)}` : ''}</span></div>
            <div className={`card ${s.stat}`}><span className={s.statLabel}>Verdicts</span><span className={s.verdicts}>{(['BLOCK', 'HOLD', 'CLEAR'] as const).map((v) => <span key={v}><Verdict verdict={v} /> {stats.byDecision[v] ?? 0}</span>)}</span><span className={s.statNote}>{stats.bySurface.check ?? 0} from payment checks, {stats.bySurface.lab ?? 0} from the attack lab</span></div>
            <div className={`card ${s.stat}`}><span className={s.statLabel}>Calls answered</span><span className={s.statValue}>{stats.callbacks}</span><span className={s.statNote}>a held decision decided again on the trusted contact’s answer</span></div>
            <div className={`card ${s.stat}`}><span className={s.statLabel}>Intelligence bought</span><span className={s.statValue}>{stats.paidAnswers} <small>answers</small></span><span className={s.statNote}>{usdc(Math.round(stats.spendUsdc * 1e6))} through Telegraph{operator ? <> · <a href={`https://devnode.telegraphprotocol.com/v1/ledger/account/${operator.toLowerCase()}`} target="_blank" rel="noreferrer">payer’s ledger on Telegraph ↗</a></> : null}</span></div>
          </section>

          <section className={`wrap ${s.feed}`}>
            <div className={s.feedHead}>
              <h2 className="h2">Latest</h2>
              <Link className="btn primary sm" href="/check">Check a payment change</Link>
            </div>
            {ledger.recent.length ? (
              <div className={`card ${s.scroll}`}>
                <table>
                  <thead><tr><th>When (UTC)</th><th>Where</th><th>Verdict</th><th>Rules that fired</th><th>Bought</th><th>Note</th></tr></thead>
                  <tbody>
                    {ledger.recent.map((e) => (
                      <tr key={`${e.at}-${e.hash}`}>
                        <td className="mono">{e.at.slice(0, 16).replace('T', ' ')}</td>
                        <td>{SURFACE[e.surface]} <span className="muted">· {STEP[e.step]}</span></td>
                        <td><Verdict verdict={e.decision} /></td>
                        <td><div className={s.rules}>{e.rules.length ? e.rules.slice(0, 3).map((r) => <span key={r} className="chip">{r}</span>) : <span className="muted">none</span>}{e.rules.length > 3 && <span className="muted">+{e.rules.length - 3}</span>}</div></td>
                        <td>{e.step === 'callback' ? <span className="muted">nothing</span> : <>{e.purchases} <span className="muted">· {usdc(e.costUusdc)}</span></>}</td>
                        <td>{e.shared ? <Link className="mono" href={`/evidence/${e.hash}`} title={e.hash}>{noteSerial(e.hash)} ↗</Link> : <span className="mono muted" title="Not shared by the person who ran it">{noteSerial(e.hash)} · private</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className={`card ${s.notice}`}>No decisions yet. <Link href="/check">Be the first: check a payment change.</Link></p>}
          </section>
        </>
      )}
    </>
  );
}
