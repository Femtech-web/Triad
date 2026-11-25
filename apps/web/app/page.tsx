import Link from 'next/link';
import { Verdict } from '@/components/verdict';
import { benchmarkReport, bestDecision, deployment, releases, roiReport } from '@/lib/data';
import { money, short } from '@/lib/format';
import s from './landing.module.css';

const WITNESSES = [
  { n: '01', title: 'The record', tag: 'Compared field by field', text: 'What you already trusted: who you pay and where, the consignee, the pickup agent, the vessel, and which contacts may change them. Every instruction is compared with it, and its sender with the real domain.',
    icon: <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" /></> },
  { n: '02', title: 'The network', tag: 'Two sources, plus OFAC', text: 'Independent checks bought through Telegraph for exactly what changed: registry, sanctions, tax number, domain, documents, vessel. Two Miners for anything that matters, OFAC’s own list for sanctions, a receipt for every answer.',
    icon: <><circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="6" r="1.8" /><circle cx="19" cy="6" r="1.8" /><circle cx="5" cy="18" r="1.8" /><circle cx="19" cy="18" r="1.8" /><path d="m6.5 7.3 3.6 3M17.5 7.3l-3.6 3M6.5 16.7l3.6-3M17.5 16.7l-3.6-3" /></> },
  { n: '03', title: 'The person', tag: 'Out of band, always', text: 'A call to the contact you already trusted, on the number you had before the email arrived. Never a number, link or address from the email itself. A confirmation answers “is this genuine?”, nothing more.',
    icon: <path d="M6.6 3.5h2.6l1.4 4-2 1.4a11 11 0 0 0 6.5 6.5l1.4-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" /> },
];

const STEPS = [
  ['Spot the change', 'Compare the instruction with the record. A look-alike sender or a changed account is caught before anything is spent.'],
  ['Buy only what matters', 'Each change maps to specific Telegraph checks. Nothing changed means nothing bought.'],
  ['Corroborate', 'Required checks need two independent Miners. Sanctions are matched against OFAC’s list.'],
  ['Call the trusted contact', 'On the number from the record. A denial blocks; a confirmation never replaces a missing check.'],
  ['Decide, then sign', 'CLEAR, HOLD or BLOCK under a versioned policy. The evidence file’s hash is what releases the money.'],
];

export default function Home() {
  const sovcomflot = bestDecision('pickup-swap-sanctioned');
  const evm = releases().find((r) => r.rail === 'sepolia');
  const svm = releases().find((r) => r.rail === 'solana-devnet');
  const sepolia = deployment('sepolia');
  const solana = deployment('solana-devnet');
  const report = benchmarkReport();
  const triad = report?.summary.find((x) => x.contestant === 'triad');
  const baseline = report?.summary.find((x) => x.contestant === 'baseline');
  const roi = roiReport();

  return (
    <>
      <section className={`wrap ${s.hero}`}>
        <span className="eyebrow rise">Live on Telegraph testnet · Mission 08</span>
        <h1 className={`display rise d1 ${s.title}`}>The company is real.<br /><span className="dim">The instruction isn’t.</span></h1>
        <p className={`lede rise d2 ${s.lede}`}>Payment-redirection fraud doesn’t fake your supplier. It fakes the change: new bank details, a new pickup agent, a substitute vessel, sent from a look-alike domain or a hijacked mailbox. Triad checks every change before money or cargo moves.</p>
        <div className={`rise d3 ${s.actions}`}>
          <Link className="btn primary lg" href="/check">Check a payment change <span className="arrow" aria-hidden="true">→</span></Link>
          <Link className="btn secondary lg" href="/console">Try to beat it</Link>
        </div>
        <p className={`rise d4 ${s.note}`}>Free on testnet · no sign-up · every decision ships with an evidence file you can verify</p>
      </section>

      <section className={`wrap rise d4 ${s.windowWrap}`} aria-label="An example decision">
        <div className={s.window}>
          <div className={s.windowBar}><span /><span /><span /><p className="mono">triad · decision</p></div>
          <div className={s.windowGrid}>
            <div className={s.mail}>
              <p className="label">Incoming email</p>
              <dl className={s.mailHead}>
                <dt>From</dt><dd>Glencore Treasury Desk <span className={s.addr}>treasury.desk@<mark>glencor.com</mark></span></dd>
                <dt>Subject</dt><dd>Updated remittance details</dd>
              </dl>
              <p className={s.mailBody}>Due to an internal audit our bank account has changed with immediate effect. Please remit TRD-GLE-1060 to the account below and confirm by return.</p>
              <div className={s.newAccount}><span className="label">New account</span><span className="mono">CH56 0483 5012 3456 7800 9</span></div>
            </div>
            <div className={s.decision}>
              <Verdict verdict="BLOCK" size="lg" reveal />
              <p className={s.headline}>Don’t pay. The sender imitates your supplier’s domain.</p>
              <ul className={s.rules}>
                <li><span className="chip block">blocks</span><span><b className="mono">R-SENDER-LOOKALIKE</b> glencor.com is one letter off glencore.com</span></li>
                <li><span className="chip hold">needs callback</span><span><b className="mono">R-PAYOUT-CHANGED</b> payment would go to a new account</span></li>
              </ul>
              <p className={s.decisionFoot}>Caught before a single check was bought.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={`wrap ${s.section}`}>
        <div className={s.sectionHead}>
          <p className="label">How Triad decides</p>
          <h2 className="h2">Three witnesses. All of them required.</h2>
        </div>
        <div className={s.witnesses}>
          {WITNESSES.map((w) => (
            <article key={w.n} className={`card ${s.witness}`}>
              <div className={s.witnessTop}>
                <span className={s.icon}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{w.icon}</svg></span>
                <span className="mono muted">{w.n}</span>
              </div>
              <h3 className="h3">{w.title}</h3>
              <p className={s.witnessText}>{w.text}</p>
              <span className="chip">{w.tag}</span>
            </article>
          ))}
        </div>
        <ol className={s.steps}>
          {STEPS.map(([title, text], i) => (
            <li key={title}><span className={s.stepNum}>{i + 1}</span><div><p className={s.stepTitle}>{title}</p><p className={s.stepText}>{text}</p></div></li>
          ))}
        </ol>
      </section>

      <section className={`wrap ${s.section}`}>
        <div className={s.sectionHead}>
          <p className="label">On record</p>
          <h2 className="h2">Not a mock-up. Every result links to its evidence.</h2>
        </div>
        <div className={s.proof}>
          {sovcomflot && (
            <article className={`card ${s.proofCard}`}>
              <div className={s.proofTop}><Verdict verdict="BLOCK" /><span className="mono muted">24 Nov</span></div>
              <h3 className="h3">A sanctioned agent, from a genuine mailbox</h3>
              <p>The seller’s real logistics contact asked to release copper to PAO Sovcomflot. Telegraph’s ranked sanctions answer said “no match”. OFAC lists it as entry 34741; Triad blocked it and recorded which source missed it.</p>
              <dl className={s.proofFacts}>
                <div><dt>Paid checks</dt><dd>{sovcomflot.evidence.cost.purchases}</dd></div>
                <div><dt>Cost</dt><dd>{Number(sovcomflot.evidence.cost.telegraphUusdc) / 1e6} USDC</dd></div>
              </dl>
              <Link className={s.proofLink} href={`/evidence/${sovcomflot.evidence_sha256}`}>Evidence <span className="mono">{short(sovcomflot.evidence_sha256, 8, 4)}</span> →</Link>
            </article>
          )}
          {evm && (
            <article className={`card ${s.proofCard}`}>
              <div className={s.proofTop}><Verdict verdict="CLEAR" /><span className="mono muted">two chains</span></div>
              <h3 className="h3">Money moves only against signed evidence</h3>
              <p>The escrow pays exactly the payee and amount the release officer signed, and the signature names the evidence file’s hash. Anything else reverts on-chain. Released on both chains so far:</p>
              <dl className={s.proofFacts}>
                <div><dt>Ethereum Sepolia</dt><dd><a className="mono" href={evm.explorer} target="_blank" rel="noreferrer">{short(evm.transaction, 6, 4)}</a></dd></div>
                {svm && <div><dt>Solana devnet</dt><dd><a className="mono" href={svm.explorer} target="_blank" rel="noreferrer">{short(svm.transaction, 6, 4)}</a></dd></div>}
              </dl>
              <p className={s.proofSources}>Contracts: <a href={`https://repo.sourcify.dev/11155111/${sepolia?.address}`} target="_blank" rel="noreferrer">ShipmentEscrow (verified source)</a>{solana?.programId && <> · <a href={`https://explorer.solana.com/address/${solana.programId}?cluster=devnet`} target="_blank" rel="noreferrer">triad_escrow program</a></>}</p>
              <Link className={s.proofLink} href={`/evidence/${(svm ?? evm).authorization.evidenceHash}`}>Evidence <span className="mono">{short((svm ?? evm).authorization.evidenceHash, 8, 4)}</span> →</Link>
            </article>
          )}
          <article className={`card ${s.proofCard}`}>
            <div className={s.proofTop}>{triad ? <span className="chip accent">{triad.answered}/40 graded</span> : <span className="chip">running</span>}<span className="mono muted">triad-v1</span></div>
            <h3 className="h3">Forty frozen cases</h3>
            {triad && baseline
              ? <p>Of {triad.attacks} attacks, Triad released <b>{triad.attacksReleased.length}</b>; a registry-and-sanctions check on the same answers released <b>{baseline.attacksReleased.length}</b>.{roi ? <> Triad’s {roi.spend.usdc.toFixed(2)} test USDC of intelligence avoided <b>{money(roi.lossAvoidedVsBaselineUsd)}</b> of paper losses.</> : null} Legitimate changes handled as expected: {triad.legitimateAsExpected} of {triad.legitimate}.</p>
              : <p>Twenty legitimate changes and twenty attacks, frozen and hashed before any paid run, against a registry-and-sanctions baseline and a frontier model. Results land as the run completes.</p>}
            <Link className={s.proofLink} href="/benchmark">The cases and every answer →</Link>
          </article>
        </div>
      </section>

      <section className="wrap">
        <div className={s.cta}>
          <div>
            <h2 className="h2">Got an email asking you to change bank details?</h2>
            <p className="lede">Check it before you pay. Enter who you pay and what the email says; Triad tells you what to do next.</p>
          </div>
          <Link className="btn primary lg" href="/check">Check a payment change <span className="arrow" aria-hidden="true">→</span></Link>
        </div>
      </section>
    </>
  );
}
