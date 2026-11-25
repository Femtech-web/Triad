import type { Metadata } from 'next';
import Link from 'next/link';
import { Verdict } from '@/components/verdict';
import { consoleCases } from '@/lib/cases';
import type { ConsoleCase } from '@/lib/cases';
import { benchmarkManifest, benchmarkReport } from '@/lib/data';
import type { BenchmarkResult, BenchmarkSummary } from '@/lib/data';
import { CATEGORY_LABEL, short } from '@/lib/format';
import s from './benchmark.module.css';

export const metadata: Metadata = { title: 'Benchmark · Triad' };

const CONTESTANTS: { id: 'triad' | 'baseline' | 'frontier'; name: string; what: string }[] = [
  { id: 'triad', name: 'Triad', what: 'The record, two independent Telegraph sources per required check plus OFAC’s own list, and the out-of-band callback, under policy triad-release-v1.' },
  { id: 'baseline', name: 'Registry and sanctions', what: 'What a typical integration does with the same paid answers: screen the parties, trust the first answer, pay if both pass. It never looks at the sender.' },
  { id: 'frontier', name: 'A frontier model', what: 'Gemini 4 Hydrogen as release officer, given the same record and instruction in plain words and asked to release, hold or block.' },
];

const FINDINGS = [
  { title: 'Attacks on the instruction pass a screen', evidence: 'attack-compromised-mailbox-aurubis',
    text: 'The company is real, so registry and sanctions pass. The baseline released three of four look-alike domains, three of four hijacked mailboxes, the Reply-To diversion, the forged bank letter and the steered callback. Triad blocked the senders from the email alone and held every changed payment for a callback.' },
  { title: 'A ranked sanctions answer flagged a real company', evidence: 'legit-bank-change-confirmed-boliden',
    text: 'Telegraph’s ranked sanctions Miner matched Boliden AB, a Swedish miner, to a Russian company called “…Bolid”. The baseline blocked two genuine payments on it. The second Miner and OFAC’s own list said no match, so Triad held for review instead: its one legitimate case not cleared.' },
  { title: 'The same Miner missed a sanctioned agent', evidence: 'attack-sanctioned-pickup-sovcomflot',
    text: 'It also said “no match” for PAO Sovcomflot, OFAC SDN entry 34741. The baseline only stopped the sanctioned agents because a registry Miner called them “not active”. Triad blocked all three on OFAC’s list.' },
];

function Result({ result }: { result: BenchmarkResult | undefined }) {
  if (!result) return <span className={s.pending}>—</span>;
  const v = result.verdict === 'RELEASE' ? 'CLEAR' : result.verdict;
  if (!v) return <span className="muted">no answer</span>;
  return result.evidence_sha256 ? <Link href={`/evidence/${result.evidence_sha256}`} title="Open the evidence file"><Verdict verdict={v} /></Link> : <span title={result.reason}><Verdict verdict={v} /></span>;
}

function Card({ summary, name, what, lead }: { summary: BenchmarkSummary | undefined; name: string; what: string; lead?: boolean }) {
  return (
    <article className={`card ${s.card} ${lead ? s.lead : ''}`}>
      <div className={s.cardTop}><p className={s.cardName}>{name}</p>{summary && <span className="chip">{summary.answered}/40 answered</span>}</div>
      {summary && summary.answered ? (
        <div className={s.numbers}>
          <div><span className={`${s.big} ${summary.attacksReleased.length ? s.bad : s.good}`}>{summary.attacksReleased.length}<small>/{summary.attacks}</small></span><span className={s.label}>attacks released</span></div>
          <div><span className={s.big}>{summary.legitimateAsExpected}<small>/{summary.legitimate}</small></span><span className={s.label}>legitimate changes handled as expected</span></div>
        </div>
      ) : <p className={s.notRun}>Not run yet</p>}
      <p className={s.what}>{what}</p>
      {summary?.purchases !== undefined && summary.answered > 0 && <p className="mono muted">{summary.purchases} paid answers · {summary.testUsdc?.toFixed(2)} test USDC</p>}
    </article>
  );
}

function Rows({ list, results }: { list: ConsoleCase[]; results: Map<string, BenchmarkResult> }) {
  return list.map((c) => (
    <tr key={c.name}>
      <td>
        <span className={s.caseTitle}>{CATEGORY_LABEL[c.category] ?? c.category}</span>
        <span className={s.caseSeller}>{c.shipment.seller.legalName}</span>
        <span className={s.caseDesc}>{c.description}</span>
      </td>
      <td data-label="Expected">{c.expected && <Verdict verdict={c.expected} />}</td>
      <td data-label="Triad"><Result result={results.get(`triad:${c.name}`)} /></td>
      <td data-label="Baseline"><Result result={results.get(`baseline:${c.name}`)} /></td>
      <td data-label="Frontier"><Result result={results.get(`frontier:${c.name}`)} /></td>
      <td className={s.try}><Link href={`/console?case=${encodeURIComponent(c.name)}`}>Try it →</Link></td>
    </tr>
  ));
}

export default function BenchmarkPage() {
  const manifest = benchmarkManifest();
  const report = benchmarkReport();
  const cases = consoleCases().filter((c) => c.group !== 'showcase');
  const results = new Map((report?.results ?? []).map((r) => [`${r.contestant}:${r.scenario}`, r]));
  const head = <thead><tr><th>Case</th><th>Expected</th><th>Triad</th><th>Baseline</th><th>Frontier</th><th /></tr></thead>;
  return (
    <>
      <section className={`wrap ${s.intro}`}>
        <p className="label rise">Benchmark · {manifest?.version ?? 'triad-v1'}</p>
        <h1 className={`display rise d1 ${s.headline}`}>Forty frozen cases.</h1>
        <p className="lede rise d2">Twenty legitimate changes and twenty attacks, built from how commodity payment fraud happens: look-alike domains, hijacked mailboxes, “affiliates” that aren’t the seller, sanctioned agents and tankers, forged bank letters. The sellers are real companies with their real legal identifiers; the people, mailboxes and accounts are synthetic. Every contestant sees the same case, and none is told which ones are attacks.</p>
        {manifest && (
          <dl className={`rise d3 ${s.manifest}`}>
            <div><dt>Frozen</dt><dd className="mono">{manifest.frozenAt.slice(0, 16).replace('T', ' ')} UTC</dd></div>
            <div><dt>Cases SHA-256</dt><dd className="mono">{short(manifest.scenariosSha256, 16, 8)}</dd></div>
            <div><dt>Scoring</dt><dd>An attack counts as released if a contestant would pay or release it.</dd></div>
          </dl>
        )}
      </section>

      <section className={`wrap ${s.cards}`}>
        {CONTESTANTS.map((c, i) => <Card key={c.id} summary={report?.summary.find((x) => x.contestant === c.id)} name={c.name} what={c.what} lead={i === 0} />)}
      </section>
      <p className={`wrap ${s.graded}`}>{report ? `Graded ${report.gradedAt.slice(0, 16).replace('T', ' ')} UTC. Triad’s verdicts link to their evidence files.` : 'The paid run is in progress. Results appear here case by case as it completes.'}</p>

      {report && (
        <section className={`wrap ${s.findings}`}>
          <h2 className="h2">What the run showed</h2>
          <div className={s.findingGrid}>
            {FINDINGS.map((f) => {
              const hash = results.get(`triad:${f.evidence}`)?.evidence_sha256;
              return (
                <article key={f.title} className={`card ${s.finding}`}>
                  <p className={s.findingTitle}>{f.title}</p>
                  <p className={s.findingText}>{f.text}</p>
                  {hash && <Link className={s.findingLink} href={`/evidence/${hash}`}>Evidence <span className="mono">{short(hash, 8, 4)}</span> →</Link>}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {(['attack', 'legitimate'] as const).map((group) => (
        <section key={group} className={`wrap ${s.cases}`}>
          <h2 className="h2">{group === 'attack' ? 'The attacks' : 'The legitimate changes'}</h2>
          <div className={`card ${s.scroll}`}>
            <table>{head}<tbody><Rows list={cases.filter((c) => c.group === group)} results={results} /></tbody></table>
          </div>
        </section>
      ))}
    </>
  );
}
