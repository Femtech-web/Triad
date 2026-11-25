import Link from 'next/link';
import { Verdict } from '@/components/verdict';
import { HeroDecision } from '@/components/hero-decision';
import { Words } from '@/components/reveal';
import { LedgerTape } from '@/components/ledger-tape';
import { Stamp } from '@/components/note';
import { benchmarkReport, bestDecision, deployment, releases, roiReport, sales } from '@/lib/data';
import { money, short } from '@/lib/format';
import { GATES, NOTE, noteSerial } from '@/lib/gates';
import s from './landing.module.css';

// The ledger strip reads live decisions; the rest of the page is the shipped record.
export const revalidate = 60;

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
  ['Issue the note', 'CLEAR, HOLD or BLOCK under a versioned policy, issued as a signed release, hold or stop note. Its hash is what releases the money.'],
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
  const firstSale = sales()[0];

  return (
    <>
      <section className={`wrap ${s.hero}`}>
        <span className="eyebrow rise">Live on Telegraph testnet</span>
        <h1 className={`display ${s.title}`}><Words load lines={['The company is real.', ['The instruction isn’t.', 'dim']]} /></h1>
        <p className={`lede rise d2 ${s.lede}`}>Payment-redirection fraud doesn’t fake your supplier. It fakes the change: new bank details, a new pickup agent, a substitute vessel, sent from a look-alike domain or a hijacked mailbox. Triad checks every change before money or cargo moves.</p>
        <div className={`rise d3 ${s.actions}`}>
          <Link className="btn primary lg" href="/check">Check a payment change <span className="arrow" aria-hidden="true">→</span></Link>
          <Link className="btn secondary lg" href="/console">Try to beat it</Link>
        </div>
        <p className={`rise d4 ${s.note}`}>Free on testnet · no sign-up · every decision is issued as a signed note you can verify</p>
      </section>

      <section className={`wrap rise d4 ${s.windowWrap}`} aria-label="Example decisions">
        <HeroDecision />
        <LedgerTape />
      </section>

      <section className={`wrap ${s.section}`}>
        <div className={s.sectionHead} data-reveal="head">
          <p className="label">How Triad decides</p>
          <h2 className="h2"><Words lines={['Three witnesses. All of them required.']} /></h2>
        </div>
        <div className={s.witnesses} data-reveal="stagger">
          {WITNESSES.map((w) => (
            <article key={w.n} className={`card ${s.witness}`} style={{ ['--i' as string]: Number(w.n) - 1 }}>
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
        <ol className={s.steps} data-reveal="steps">
          {STEPS.map(([title, text], i) => (
            <li key={title} style={{ ['--i' as string]: i }}><span className={s.stepNum}>{i + 1}</span><div><p className={s.stepTitle}>{title}</p><p className={s.stepText}>{text}</p></div></li>
          ))}
        </ol>
      </section>

      <section className={`wrap ${s.section}`}>
        <div className={s.sectionHead} data-reveal="head">
          <p className="label">Gates</p>
          <h2 className="h2"><Words lines={['One engine. A gate for every change.']} /></h2>
          <p className="lede">Each kind of change goes through its own gate: what it guards, what Triad buys for it, and the note it issues. Release, hold or stop, signed and numbered.</p>
        </div>
        <div className={s.gates} data-reveal="stagger">
          {GATES.map((g, i) => (
            <article key={g.id} className={`card ${s.gate}`} style={{ ['--i' as string]: i }}>
              <div className={s.gateTop}><span className={s.gateId}>{g.id}</span><span className="chip">{g.where.href === '/check' ? 'Live in the check' : 'In the attack lab'}</span></div>
              <h3 className="h3">{g.name}</h3>
              <p>{g.guards}</p>
              <ul className={s.gateBuys}>{g.buys.map((b) => <li key={b}>{b}</li>)}</ul>
              <div className={s.gateStamps}><Stamp verdict="CLEAR" /><Stamp verdict="HOLD" /><Stamp verdict="BLOCK" /></div>
              <div className={s.gateFoot}>
                {g.examples.map((name) => bestDecision(name)).filter((d) => d !== null).map((d) => (
                  <Link key={d!.evidence_sha256} href={`/evidence/${d!.evidence_sha256}`}>{NOTE[d!.evidence.decision.decision].kind} <span className="mono">{noteSerial(d!.evidence_sha256)}</span> →</Link>
                ))}
                <Link href={g.where.href}>{g.where.label} →</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`wrap ${s.section}`}>
        <div className={s.sectionHead} data-reveal="head">
          <p className="label">On record</p>
          <h2 className="h2"><Words lines={['Not a mock-up. Every result links to its evidence.']} /></h2>
        </div>
        <div className={s.proof} data-reveal="stagger">
          {sovcomflot && (
            <article className={`card ${s.proofCard}`} style={{ ['--i' as string]: 0 }}>
              <div className={s.proofTop}><Verdict verdict="BLOCK" /><span className="mono muted">24 Nov</span></div>
              <h3 className="h3">A sanctioned agent, from a genuine mailbox</h3>
              <p>The seller’s real logistics contact asked to release copper to PAO Sovcomflot. Telegraph’s ranked sanctions answer said “no match”. OFAC lists it as entry 34741; Triad blocked it and recorded which source missed it.</p>
              <dl className={s.proofFacts}>
                <div><dt>Paid checks</dt><dd>{sovcomflot.evidence.cost.purchases}</dd></div>
                <div><dt>Cost</dt><dd>{Number(sovcomflot.evidence.cost.telegraphUusdc) / 1e6} USDC</dd></div>
              </dl>
              <Link className={s.proofLink} href={`/evidence/${sovcomflot.evidence_sha256}`}>Stop note <span className="mono">{noteSerial(sovcomflot.evidence_sha256)}</span> →</Link>
            </article>
          )}
          {evm && (
            <article className={`card ${s.proofCard}`} style={{ ['--i' as string]: 1 }}>
              <div className={s.proofTop}><Verdict verdict="CLEAR" /><span className="mono muted">two chains</span></div>
              <h3 className="h3">Money moves only against signed evidence</h3>
              <p>The escrow pays exactly the payee and amount the release officer signed, and the signature names the release note’s hash. Anything else reverts on-chain. Released on both chains so far:</p>
              <dl className={s.proofFacts}>
                <div><dt>Ethereum Sepolia</dt><dd><a className="mono" href={evm.explorer} target="_blank" rel="noreferrer">{short(evm.transaction, 6, 4)}</a></dd></div>
                {svm && <div><dt>Solana devnet</dt><dd><a className="mono" href={svm.explorer} target="_blank" rel="noreferrer">{short(svm.transaction, 6, 4)}</a></dd></div>}
              </dl>
              <p className={s.proofSources}>Contracts: <a href={`https://repo.sourcify.dev/11155111/${sepolia?.address}`} target="_blank" rel="noreferrer">ShipmentEscrow (verified source)</a>{solana?.programId && <> · <a href={`https://explorer.solana.com/address/${solana.programId}?cluster=devnet`} target="_blank" rel="noreferrer">triad_escrow program</a></>}</p>
              <Link className={s.proofLink} href={`/evidence/${(svm ?? evm).authorization.evidenceHash}`}>Release note <span className="mono">{noteSerial((svm ?? evm).authorization.evidenceHash)}</span> →</Link>
            </article>
          )}
          <article className={`card ${s.proofCard}`} style={{ ['--i' as string]: 2 }}>
            <div className={s.proofTop}>{triad ? <span className="chip accent">{triad.answered}/40 graded</span> : <span className="chip">running</span>}<span className="mono muted">triad-v1</span></div>
            <h3 className="h3">Forty frozen cases</h3>
            {triad && baseline
              ? <p>Of {triad.attacks} attacks, Triad released <b>{triad.attacksReleased.length}</b>; a registry-and-sanctions check on the same answers released <b>{baseline.attacksReleased.length}</b>.{roi ? <> Triad’s {roi.spend.usdc.toFixed(2)} test USDC of intelligence avoided <b>{money(roi.lossAvoidedVsBaselineUsd)}</b> of paper losses.</> : null} Legitimate changes handled as expected: {triad.legitimateAsExpected} of {triad.legitimate}.</p>
              : <p>Twenty legitimate changes and twenty attacks, frozen and hashed before any paid run, against a registry-and-sanctions baseline and a frontier model. Results land as the run completes.</p>}
            <Link className={s.proofLink} href="/benchmark">The cases and every answer →</Link>
          </article>
        </div>
      </section>

      <section className={`wrap ${s.section}`}>
        <div className={s.sectionHead} data-reveal="head">
          <p className="label">Where it runs</p>
          <h2 className="h2"><Words lines={['Solana and Ethereum, end to end.']} /></h2>
          <p className={s.brief}>Triad answers use case 4 of Telegraph’s Solana brief, Verified Global Trade &amp; Autonomous Commerce: a buyer-to-supplier payment that independent intelligence holds when something is wrong, and that settles in stablecoins when the record, the network and the person agree.</p>
        </div>
        <div className={s.chains} data-reveal="stagger">
          <article className={`card ${s.chain}`} style={{ ['--i' as string]: 0 }}>
            <div className={s.chainTop}><span className="chip accent">Solana devnet</span><span className="mono muted">x402 · Anchor</span></div>
            <h3 className="h3">Buys, settles and sells in USDC</h3>
            <ul className={s.chainList}>
              <li><span className="label">Buys</span><span>Every Telegraph check, paid per answer over x402.{roi ? <> The benchmark bought {roi.spend.answers} answers for {roi.spend.usdc.toFixed(2)} USDC.</> : null}</span></li>
              <li><span className="label">Settles</span><span>The trade sits in the <span className="mono">triad_escrow</span> program; an ed25519 authorization naming the evidence hash releases it.{svm && <> <a className="mono" href={svm.explorer} target="_blank" rel="noreferrer">{short(svm.transaction, 6, 4)}</a></>}</span></li>
              <li><span className="label">Sells</span><span>Its own checks to agents over x402, $0.05 each.{firstSale && <> First sale: <a className="mono" href={firstSale.explorer} target="_blank" rel="noreferrer">{short(firstSale.transaction, 6, 4)}</a></>}</span></li>
            </ul>
          </article>
          <article className={`card ${s.chain}`} style={{ ['--i' as string]: 1 }}>
            <div className={s.chainTop}><span className="chip">Ethereum Sepolia</span><span className="mono muted">escrow · Foundry</span></div>
            <h3 className="h3">Pays, settles and signs</h3>
            <ul className={s.chainList}>
              <li><span className="label">Pays</span><span>Telegraph through its escrow rail, one EIP-191 authorization per call.</span></li>
              <li><span className="label">Settles</span><span>The trade sits in <span className="mono">ShipmentEscrow</span>; an EIP-712 authorization releases it.{evm && <> <a className="mono" href={evm.explorer} target="_blank" rel="noreferrer">{short(evm.transaction, 6, 4)}</a></>}</span></li>
              <li><span className="label">Signs</span><span>Every evidence file’s hash, with Triad’s issuer key, so anyone can check where a file came from. <Link href="/evidence">Verify one →</Link></span></li>
            </ul>
          </article>
        </div>
      </section>

      <section className="wrap">
        <div className={s.cta} data-reveal="">
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
