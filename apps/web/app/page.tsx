import Link from 'next/link';
import { benchmarkReport, bestDecision, deployment, releases } from '@/lib/data';
import styles from './landing.module.css';

const short = (hash: string, n = 10) => `${hash.slice(0, n)}…${hash.slice(-6)}`;

export default function Home() {
  const sovcomflot = bestDecision('pickup-swap-sanctioned');
  const release = releases()[0];
  const sepolia = deployment('sepolia');
  const report = benchmarkReport();
  const triad = report?.summary.find((s) => s.contestant === 'triad');
  const baseline = report?.summary.find((s) => s.contestant === 'baseline');

  return (
    <>
      <section className={`wrap ${styles.hero}`}>
        <div className={styles.heroText}>
          <p className="kicker rise">A release gate for physical commodity trades</p>
          <h1 className="display rise d1">The company is real.<br /><em>The instruction isn&apos;t.</em></h1>
          <p className="lede rise d2">
            Payment-redirection fraud never fakes the supplier. It fakes the change: new bank details, a new pickup agent, a different
            vessel, sent from a look-alike domain or a compromised genuine mailbox. Registry and sanctions checks pass, because the company
            is real. Triad holds the payment or the cargo until three independent witnesses agree.
          </p>
          <div className={`rise d3 ${styles.actions}`}>
            <Link className="btn" href="/console">Try to get a payment past it</Link>
            <Link className="btn ghost" href="/benchmark">See the benchmark</Link>
          </div>
        </div>

        <figure className={`doc rise d2 ${styles.email}`} aria-label="An example attack email and Triad's decision">
          <div className="doc-head"><span className="kicker">Incoming instruction</span><span className="mono muted">09:00 UTC</span></div>
          <div className="doc-body">
            <dl className="fields">
              <dt>From</dt><dd>Glencore Treasury Desk &lt;treasury.desk@<mark className={styles.flag}>glencor.com</mark>&gt;</dd>
              <dt>Subject</dt><dd>Updated remittance details</dd>
            </dl>
            <p className={styles.body}>Due to an internal audit our bank account has changed with immediate effect. Please remit TRD-GLE-1060 to the account below and confirm by return.</p>
            <div className="perforation" />
            <p className={`mono ${styles.reason}`}>R-SENDER-LOOKALIKE · glencor.com differs from glencore.com by 1 character</p>
          </div>
          <span className={`stamp block big press ${styles.stamp}`}>BLOCK</span>
        </figure>
      </section>

      <section className={`wrap ${styles.witnesses}`}>
        <p className="kicker">Three witnesses, all required</p>
        <div className={styles.triad}>
          <article className="doc">
            <div className="doc-body">
              <span className={styles.num}>I</span>
              <h3 className={styles.wTitle}>The record</h3>
              <p>What the desk already trusted: the payee and account, consignee, pickup party, vessel, documents, and the contacts allowed to change them. Every instruction is compared with it.</p>
            </div>
          </article>
          <article className="doc">
            <div className="doc-body">
              <span className={styles.num}>II</span>
              <h3 className={styles.wTitle}>The network</h3>
              <p>Independent checks bought through Telegraph for exactly what changed: registry, sanctions, tax number, company domain, documents, vessel. Two sources for anything that matters, OFAC&apos;s own list for sanctions, and a receipt for every answer.</p>
            </div>
          </article>
          <article className="doc">
            <div className="doc-body">
              <span className={styles.num}>III</span>
              <h3 className={styles.wTitle}>The person</h3>
              <p>A call to the contact the record already trusted, by phone where possible, never through the mailbox the change came from. A confirmation only answers &ldquo;is this genuine?&rdquo;; it never stands in for a missing check.</p>
            </div>
          </article>
        </div>
      </section>

      <section className={`wrap ${styles.proof}`}>
        <h2 className="section">What it has already done</h2>
        <div className={styles.proofGrid}>
          {sovcomflot && (
            <article className="doc">
              <div className="doc-head"><span className="doc-title">A sanctioned agent, from a genuine mailbox</span><span className="stamp block">BLOCK</span></div>
              <div className="doc-body">
                <p>The seller&apos;s real logistics contact asked to release a cargo to a new pickup agent, PAO Sovcomflot. Telegraph&apos;s ranked sanctions answer said &ldquo;no match&rdquo;. OFAC&apos;s SDN list has it as entry 34741, so Triad blocked the release and recorded which source missed it.</p>
                <dl className="fields">
                  <dt>Paid checks</dt><dd>{sovcomflot.evidence.cost.purchases}, {Number(sovcomflot.evidence.cost.telegraphUusdc) / 1e6} test USDC</dd>
                  <dt>Evidence</dt><dd><Link className="mono" href={`/evidence/${sovcomflot.evidence_sha256}`}>{short(sovcomflot.evidence_sha256)}</Link></dd>
                </dl>
              </div>
            </article>
          )}
          {release && (
            <article className="doc">
              <div className="doc-head"><span className="doc-title">Money moves only against signed evidence</span><span className="stamp clear">CLEAR</span></div>
              <div className="doc-body">
                <p>The escrow pays exactly the payee and amount the release officer signed, and the signature names the evidence file. Anything else reverts on-chain.</p>
                <dl className="fields">
                  <dt>Release</dt><dd><a className="mono" href={release.explorer} target="_blank" rel="noreferrer">{short(release.transaction)}</a> · Sepolia</dd>
                  <dt>Evidence</dt><dd><Link className="mono" href={`/evidence/${release.authorization.evidenceHash}`}>{short(release.authorization.evidenceHash)}</Link></dd>
                  {sepolia?.address && <><dt>Escrow</dt><dd><a className="mono" href={`https://sepolia.etherscan.io/address/${sepolia.address}`} target="_blank" rel="noreferrer">{short(sepolia.address, 8)}</a> · <a href={`https://repo.sourcify.dev/11155111/${sepolia.address}`} target="_blank" rel="noreferrer">source verified</a></dd></>}
                </dl>
              </div>
            </article>
          )}
          <article className="doc">
            <div className="doc-head"><span className="doc-title">Forty frozen cases</span>{triad ? <span className="stamp hold">{triad.attacksReleased.length} RELEASED</span> : <span className="chip">running</span>}</div>
            <div className="doc-body">
              {triad && baseline ? (
                <p>Of {triad.attacks} attacks, Triad released <strong>{triad.attacksReleased.length}</strong>. A registry-and-sanctions check bought from the same answers released <strong>{baseline.attacksReleased.length}</strong>. Legitimate changes handled as expected: {triad.legitimateAsExpected} of {triad.legitimate}.</p>
              ) : (
                <p>Twenty legitimate changes and twenty attacks, frozen and hashed before any paid run, against a registry-and-sanctions baseline and a frontier model. Results appear here as the run completes.</p>
              )}
              <Link href="/benchmark">The cases, and every answer behind them</Link>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
