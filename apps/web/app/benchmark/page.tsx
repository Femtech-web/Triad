import type { Metadata } from 'next';
import Link from 'next/link';
import { Stamp } from '@/components/stamp';
import { consoleCases } from '@/lib/cases';
import type { ConsoleCase } from '@/lib/cases';
import { benchmarkManifest, benchmarkReport } from '@/lib/data';
import type { BenchmarkResult, BenchmarkSummary } from '@/lib/data';
import { CATEGORY_LABEL, short } from '@/lib/format';
import s from './benchmark.module.css';

export const metadata: Metadata = { title: 'Benchmark · Triad' };

const CONTESTANTS: { id: 'triad' | 'baseline' | 'frontier'; name: string; what: string }[] = [
  { id: 'triad', name: 'Triad', what: 'The record, two independent Telegraph sources per required check plus OFAC’s own list, and the out-of-band callback, under policy triad-release-v1.' },
  { id: 'baseline', name: 'Registry and sanctions', what: 'What a typical integration does with the same paid answers: screen the parties through the registry and the sanctions list, trust the first answer, pay if both pass. It never looks at the sender.' },
  { id: 'frontier', name: 'A frontier model', what: 'Gemini 4 Hydrogen as release officer, given the same record and instruction in plain words and asked to release, hold or block.' },
];

function Verdict({ result }: { result: BenchmarkResult | undefined }) {
  if (!result) return <span className="muted">—</span>;
  const v = result.verdict === 'RELEASE' ? 'CLEAR' : result.verdict;
  if (!v) return <span className="muted">no answer</span>;
  const stamp = <Stamp verdict={v} className={s.mini} />;
  return result.evidence_sha256 ? <Link href={`/evidence/${result.evidence_sha256}`} title="Open the evidence file">{stamp}</Link> : <span title={result.reason}>{stamp}</span>;
}

function Card({ summary, name, what }: { summary: BenchmarkSummary | undefined; name: string; what: string }) {
  return (
    <article className={`doc ${s.card}`}>
      <div className="doc-head"><span className="doc-title">{name}</span>{summary && <span className="kicker">{summary.answered}/40 answered</span>}</div>
      <div className="doc-body">
        {summary && summary.answered ? (
          <div className={s.numbers}>
            <div><span className={`${s.big} ${summary.attacksReleased.length ? s.bad : s.good}`}>{summary.attacksReleased.length}</span><span className={s.label}>of {summary.attacks} attacks released</span></div>
            <div><span className={s.big}>{summary.legitimateAsExpected}</span><span className={s.label}>of {summary.legitimate} legitimate changes handled as expected</span></div>
          </div>
        ) : <p className={s.pending}>Not run yet.</p>}
        <p className={s.what}>{what}</p>
        {summary?.purchases !== undefined && summary.answered > 0 && <p className="mono muted">{summary.purchases} paid answers · {summary.testUsdc?.toFixed(2)} test USDC</p>}
      </div>
    </article>
  );
}

function CaseRows({ list, results }: { list: ConsoleCase[]; results: Map<string, BenchmarkResult> }) {
  return list.map((c) => (
    <tr key={c.name}>
      <td>
        <span className={s.caseTitle}>{CATEGORY_LABEL[c.category] ?? c.category}</span>
        <span className={s.caseSeller}>{c.shipment.seller.legalName}</span>
        <span className={s.caseDesc}>{c.description}</span>
      </td>
      <td data-label="Expected">{c.expected && <Stamp verdict={c.expected} className={s.mini} />}</td>
      <td data-label="Triad"><Verdict result={results.get(`triad:${c.name}`)} /></td>
      <td data-label="Baseline"><Verdict result={results.get(`baseline:${c.name}`)} /></td>
      <td data-label="Frontier"><Verdict result={results.get(`frontier:${c.name}`)} /></td>
      <td className={s.try}><Link href={`/console?case=${encodeURIComponent(c.name)}`}>Try it</Link></td>
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
        <p className="kicker rise">Benchmark · {manifest?.version ?? 'triad-v1'}</p>
        <h1 className={`display rise d1 ${s.headline}`}>Forty frozen cases.</h1>
        <p className="lede rise d2">Twenty legitimate changes and twenty attacks, built from how commodity payment fraud happens: look-alike domains, compromised mailboxes, affiliates that are not the seller, sanctioned agents and tankers, forged bank letters. The sellers are real companies with their real legal identifiers; the people, mailboxes and accounts are synthetic. Every contestant sees the same case, and none is told which ones are attacks.</p>
        {manifest && (
          <dl className={`fields ${s.manifest}`}>
            <dt>Frozen</dt><dd className="mono">{manifest.frozenAt.slice(0, 16).replace('T', ' ')} UTC, before any paid run</dd>
            <dt>Cases SHA-256</dt><dd className="mono">{manifest.scenariosSha256}</dd>
            <dt>Scoring</dt><dd>{manifest.rule}</dd>
          </dl>
        )}
      </section>

      <section className={`wrap ${s.cards}`}>
        {CONTESTANTS.map((c) => <Card key={c.id} summary={report?.summary.find((x) => x.contestant === c.id)} name={c.name} what={c.what} />)}
      </section>
      {report ? <p className={`wrap mono muted ${s.graded}`}>Graded {report.gradedAt.slice(0, 16).replace('T', ' ')} UTC. Triad’s verdicts link to their evidence files.</p>
        : <p className={`wrap ${s.graded}`}>The paid run is in progress. Results appear here as it completes, case by case.</p>}

      {(['attack', 'legitimate'] as const).map((group) => (
        <section key={group} className={`wrap ${s.cases}`}>
          <h2 className="section">{group === 'attack' ? 'The attacks' : 'The legitimate changes'}</h2>
          <div className={s.scroll}>
            <table>{head}<tbody><CaseRows list={cases.filter((c) => c.group === group)} results={results} /></tbody></table>
          </div>
        </section>
      ))}
      {manifest && <p className={`wrap mono muted ${s.graded}`}>benchmark/triad-v1/scenarios.jsonl · sha256 {short(manifest.scenariosSha256, 12, 8)}</p>}
    </>
  );
}
