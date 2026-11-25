'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { instructionSchema } from '@triad/core';
import type { CheckOutcome, CheckRequest } from '@triad/core';
import type { Instruction, Party, Shipment } from '@triad/core';
import type { Attestation, EvidenceFile } from '@triad/evidence/canonical';
import { Decision } from '@/components/decision';
import { LiveChecks } from '@/components/live-checks';
import { EvidenceView } from '@/components/evidence-view';
import { Verdict } from '@/components/verdict';
import type { ConsoleCase } from '@/lib/cases';
import { CATEGORY_LABEL, checkTitle, paperValue, RELATION_LABEL, short, usdc } from '@/lib/format';
import { MOVES } from '@/lib/moves';
import { preflight } from '@/lib/preflight';
import { postStream } from '@/lib/stream-client';
import { noteSerial } from '@/lib/gates';
import s from './console.module.css';

interface Issued { evidence: EvidenceFile; evidence_sha256: string; seal?: string; attestation?: Attestation | null }
interface Release { escrow: string; fundTx: string | null; releaseTx: string; explorer: string; payee: string; amount: string; signer: string }
interface Run { mode: 'live' | 'replay'; steps: Issued[]; release: Release | null; draftKey: string; permalink: string | null }
type Busy = { kind: 'live' | 'replay' | 'callback' | 'release' | 'retry' | 'share'; started: number } | null;

const PRICE_UUSDC = 10_000;
const keyOf = (i: Instruction) => JSON.stringify(i);
const without = <T extends object>(o: T, key: keyof T): T => { const next = { ...o }; delete next[key]; return next; };
const caseTitle = (c: ConsoleCase) => CATEGORY_LABEL[c.category] ?? c.category;
const GROUP_LABEL = { showcase: 'On record', attack: 'Attack', legitimate: 'Legitimate' } as const;

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function useElapsed(busy: Busy): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [busy]);
  return busy ? Math.max(0, (now - busy.started) / 1000) : 0;
}

/* Case picker */

function CasePicker({ cases, current, onPick }: { cases: ConsoleCase[]; current: ConsoleCase; onPick: (name: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<'all' | ConsoleCase['group']>('all');
  const shown = cases.filter((c) => (group === 'all' || c.group === group)
    && `${c.name} ${caseTitle(c)} ${c.description} ${c.shipment.seller.legalName}`.toLowerCase().includes(query.trim().toLowerCase()));
  const counts = { all: cases.length, attack: cases.filter((c) => c.group === 'attack').length, legitimate: cases.filter((c) => c.group === 'legitimate').length, showcase: cases.filter((c) => c.group === 'showcase').length };
  return (
    <div className={`card ${s.caseBar}`}>
      <div className={s.caseNow}>
        <div className={s.caseChips}>
          <span className={`chip ${current.group === 'attack' ? 'block' : current.group === 'legitimate' ? 'clear' : 'accent'}`}>{GROUP_LABEL[current.group]}</span>
          <span className="mono muted">{current.name}</span>
        </div>
        <h2 className={s.caseTitle}>{caseTitle(current)} <span className={s.caseSeller}>· {current.shipment.seller.legalName}</span></h2>
        <p className={s.caseDesc}>{current.description}</p>
      </div>
      <div className={s.caseSide}>
        {current.expected && <span className={s.expected}>Benchmark expects <Verdict verdict={current.expected} /></span>}
        <button type="button" className="btn secondary" onClick={() => dialog.current?.showModal()}>Choose a case <span className="muted">{cases.length}</span></button>
      </div>
      <dialog ref={dialog} className={s.dialog} onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
        <div className={s.dialogHead}>
          <input className="input" placeholder="Search cases, companies, tricks…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>Close</button>
        </div>
        <div className={s.dialogTabs}>
          <div className="segmented">
            {(['all', 'attack', 'legitimate', 'showcase'] as const).map((g) => (
              <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>{g === 'all' ? 'All' : g === 'showcase' ? 'On record' : g === 'attack' ? 'Attacks' : 'Legitimate'} <span className="muted">{counts[g]}</span></button>
            ))}
          </div>
        </div>
        <ul className={s.caseList}>
          {shown.map((c) => (
            <li key={c.name}>
              <button type="button" className={`${s.caseItem} ${c.name === current.name ? s.caseActive : ''}`} onClick={() => { onPick(c.name); dialog.current?.close(); }}>
                <span className={s.caseItemTop}>
                  <span className={s.caseItemTitle}>{caseTitle(c)}</span>
                  {c.expected ? <Verdict verdict={c.expected} /> : <span className="chip accent">on record</span>}
                </span>
                <span className={s.caseItemSeller}>{c.shipment.seller.legalName}</span>
                <span className={s.caseItemDesc}>{c.description}</span>
                {c.recorded && <span className={s.recorded}>Recorded run · {c.recorded.purchases} purchases</span>}
              </button>
            </li>
          ))}
          {!shown.length && <li className={s.noMatch}>No case matches.</li>}
        </ul>
      </dialog>
    </div>
  );
}

/* The trusted record */

function Record({ shipment }: { shipment: Shipment }) {
  const authorized = shipment.seller.contacts.filter((c) => shipment.authorizedContactIds.includes(c.id));
  return (
    <details className={`card ${s.record}`} open>
      <summary className="card-head"><span className="card-title">The record</span><span className="muted">trusted before the email arrived</span></summary>
      <div className="card-body">
        <dl className="fields">
          <dt>Shipment</dt><dd>{shipment.reference} · {shipment.commodity}, {shipment.quantity}{shipment.loadPort ? ` · ${shipment.loadPort} → ${shipment.dischargePort}` : ''}</dd>
          <dt>Seller</dt><dd>{shipment.seller.legalName} ({shipment.seller.country}){shipment.seller.registrationId && <span className="mono muted"> · {shipment.seller.registrationId}</span>}</dd>
          <dt>Trusted domain</dt><dd className="mono">{shipment.seller.domain ?? 'none'}</dd>
          <dt>May instruct</dt><dd>{authorized.map((c) => <span key={c.id} className={s.contact}>{c.name} <span className="mono muted">{c.email}{c.phone ? ` · ${c.phone}` : ''}</span></span>)}</dd>
          <dt>Pays</dt><dd>{shipment.payout.holderName} <span className="mono muted">{shipment.payout.bankRef ?? short(shipment.payout.address, 8, 6)}</span></dd>
          <dt>Consignee</dt><dd>{shipment.consignee.legalName} ({shipment.consignee.country})</dd>
          {shipment.pickupParty && <><dt>Pickup agent</dt><dd>{shipment.pickupParty.legalName} ({shipment.pickupParty.country})</dd></>}
          {shipment.vessel && <><dt>Vessel</dt><dd>{shipment.vessel.name} <span className="mono muted">{shipment.vessel.imo}</span></dd></>}
        </dl>
      </div>
    </details>
  );
}

/* The instruction editor */

type ChangeKey = 'payout' | 'pickupParty' | 'consignee' | 'vessel';

function Field({ label, value, onChange, mono, placeholder, invalid }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; placeholder?: string; invalid?: string | null }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className={`input${mono ? ' mono' : ''}`} value={value} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(invalid)} />
      {invalid && <span className="error">{invalid}</span>}
    </label>
  );
}

function Editor({ shipment, draft, setDraft, original }: { shipment: Shipment; draft: Instruction; setDraft: (i: Instruction) => void; original: Instruction }) {
  const set = (patch: Partial<Instruction>) => setDraft({ ...draft, ...patch });
  const channel = (patch: Partial<Instruction['channel']>) => {
    const next = { ...draft.channel, ...patch };
    set({ channel: next.replyTo ? next : without(next, 'replyTo') });
  };
  const changes = (key: ChangeKey, value: unknown) => {
    const next = { ...draft.changes } as Record<string, unknown>;
    if (value === undefined) delete next[key]; else next[key] = value;
    set({ changes: next as Instruction['changes'] });
  };
  const toggles: { key: ChangeKey; label: string; start: () => unknown }[] = [
    { key: 'payout', label: 'Bank account', start: () => ({ ...shipment.payout }) },
    { key: 'pickupParty', label: 'Pickup agent', start: () => ({ id: 'pickup-new', legalName: '', country: '', contacts: [] }) },
    { key: 'consignee', label: 'Consignee', start: () => ({ id: 'consignee-new', legalName: '', country: '', contacts: [] }) },
    { key: 'vessel', label: 'Vessel', start: () => (shipment.vessel ? { ...shipment.vessel } : { name: '', imo: '' }) },
  ];
  const evm = shipment.payout.rail === 'sepolia';
  const payout = draft.changes.payout;
  const addressProblem = payout && (evm ? !/^0x[0-9a-fA-F]{40}$/.test(payout.address) : !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(payout.address)) ? `Not a ${evm ? 'Sepolia' : 'Solana'} address` : null;
  const party = (key: 'pickupParty' | 'consignee', next: Party) => changes(key, next);

  return (
    <div className="card">
      <div className="card-head"><span className="card-title">The incoming instruction</span><span className="mono muted">{draft.receivedAt.slice(11, 16)} UTC</span></div>
      <div className={`card-body ${s.editorBody}`}>
        <div className={s.moves} role="group" aria-label="Attacker's moves">
          <span className={s.movesLabel}>Attacker’s moves</span>
          {MOVES.map((m) => <button key={m.id} type="button" className={s.move} title={m.hint} onClick={() => setDraft(m.apply(shipment, draft))}>{m.label}</button>)}
          <button type="button" className={`${s.move} ${s.reset}`} onClick={() => setDraft(original)} disabled={keyOf(draft) === keyOf(original)}>Reset</button>
        </div>
        <div className={s.headers}>
          <Field label="From (name)" value={draft.channel.displayName} onChange={(v) => channel({ displayName: v })} />
          <Field label="From (address)" value={draft.channel.from} onChange={(v) => channel({ from: v })} mono />
          <Field label="Reply-To" value={draft.channel.replyTo ?? ''} onChange={(v) => channel({ replyTo: v })} mono placeholder="none" />
        </div>
        <label className="field">
          <span>Message</span>
          <textarea className="textarea" value={draft.summary} rows={3} onChange={(e) => set({ summary: e.target.value })} />
        </label>

        <div className={s.changesHead}>
          <span className="label">What it asks to change</span>
          <span className={s.toggles}>
            {toggles.map((t) => {
              const on = draft.changes[t.key] !== undefined;
              return <button key={t.key} type="button" className={`${s.toggle} ${on ? s.toggleOn : ''}`} aria-pressed={on} onClick={() => changes(t.key, on ? undefined : t.start())}>{on ? '−' : '+'} {t.label}</button>;
            })}
          </span>
        </div>
        {!Object.keys(draft.changes).length && <p className={s.noChange}>Nothing: this instruction only asks to settle as agreed.</p>}
        {payout && (
          <fieldset className={s.change}>
            <legend>New bank account</legend>
            <Field label="Account holder" value={payout.holderName} onChange={(v) => changes('payout', { ...payout, holderName: v })} />
            <Field label={evm ? 'Sepolia address' : 'Solana address'} value={payout.address} onChange={(v) => changes('payout', { ...payout, address: v.trim() })} mono invalid={addressProblem} />
            <Field label="Bank reference" value={payout.bankRef ?? ''} onChange={(v) => changes('payout', v ? { ...payout, bankRef: v } : without(payout, 'bankRef'))} mono />
            <p className={s.tip}>Put your own {evm ? 'Sepolia' : 'Solana devnet'} address here. Get it past Triad and a live run’s escrow pays it.</p>
          </fieldset>
        )}
        {(['pickupParty', 'consignee'] as const).map((key) => {
          const p = draft.changes[key];
          return p && (
            <fieldset key={key} className={s.change}>
              <legend>{key === 'pickupParty' ? 'New pickup agent' : 'New consignee'}</legend>
              <Field label="Legal name" value={p.legalName} onChange={(v) => party(key, { ...p, legalName: v })} />
              <Field label="Country (ISO)" value={p.country} onChange={(v) => party(key, { ...p, country: v.toUpperCase().slice(0, 2) })} mono />
              <Field label="Registration ID" value={p.registrationId ?? ''} onChange={(v) => party(key, v ? { ...p, registrationId: v } : without(p, 'registrationId'))} mono placeholder="optional" />
            </fieldset>
          );
        })}
        {draft.changes.vessel && (
          <fieldset className={s.change}>
            <legend>Substitute vessel</legend>
            <Field label="Vessel name" value={draft.changes.vessel.name} onChange={(v) => changes('vessel', { ...draft.changes.vessel, name: v })} />
            <Field label="IMO number" value={draft.changes.vessel.imo} onChange={(v) => changes('vessel', { ...draft.changes.vessel, imo: v.toUpperCase() })} mono />
          </fieldset>
        )}
        {draft.changes.documents?.map((d) => (
          <div key={d.sha256} className={s.attachment}>
            <span className="label">Attached {d.kind.replace(/_/g, ' ')}</span>
            <span className="mono muted">{d.reference} · sha256 {short(d.sha256, 8, 6)}</span>
            {d.content && <p>“{d.content}”</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Before anything is bought */

function Preflight({ shipment, draft }: { shipment: Shipment; draft: Instruction }) {
  const analysis = useMemo(() => {
    const parsed = instructionSchema.safeParse(draft);
    if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.') || 'instruction'}: ${i.message}`).slice(0, 3) };
    return preflight(shipment, parsed.data);
  }, [shipment, draft]);

  if ('error' in analysis) return <p className={s.invalidNote}>The instruction can’t be read yet: {analysis.error?.join('; ')}</p>;
  const { changeSet, plan, hits, maxCalls, blocked } = analysis;
  const relation = changeSet.sender.domain;
  return (
    <div className={s.preflight}>
      <p className="label">Before anything is bought</p>
      <p className={s.senderLine}>
        <span className={`chip ${relation?.relation === 'same' || relation?.relation === 'subdomain' ? 'clear' : relation?.relation === 'lookalike' || relation?.relation === 'brand_in_other_domain' ? 'block' : 'hold'}`}>{relation ? RELATION_LABEL[relation.relation] : 'no domain'}</span>
        <span>{relation?.reason ?? 'The record has no trusted domain.'}</span>
      </p>
      {hits.some((h) => h.text !== relation?.reason) && (
        <ul className={s.preHits}>
          {hits.filter((h) => h.text !== relation?.reason).map((h, i) => <li key={i}><span className={`chip ${h.effect === 'block' ? 'block' : 'hold'}`}>{h.effect === 'block' ? 'blocks' : h.effect === 'hold_callback' ? 'needs callback' : 'needs evidence'}</span><span><b className="mono">{h.rule}</b> {h.text}</span></li>)}
        </ul>
      )}
      <p className={s.planHead}>{blocked ? 'Blocked from the email alone, so nothing will be bought.' : plan.length ? <>Triad will buy <b>{plan.length} check{plan.length === 1 ? '' : 's'}</b>, at most {maxCalls} calls ({usdc(maxCalls * PRICE_UUSDC)}). Required ones go to two independent Miners.</> : 'Nothing changed, so nothing needs buying.'}</p>
      {plan.length > 0 && <ul className={s.plan}>{plan.map((c) => <li key={c.id}><span>{checkTitle(c.id)}</span><span className="chip">{c.required ? 'two sources' : 'optional'}</span></li>)}</ul>}
    </div>
  );
}

/* The lab */

export function Console({ cases, live, prices, issuer }: { cases: ConsoleCase[]; live: { enabled: boolean; reason: string | null }; prices: Record<string, number>; issuer: string | null }) {
  const [caseName, setCaseName] = useState(cases[0]!.name);
  const current = cases.find((c) => c.name === caseName) ?? cases[0]!;
  const [draft, setDraft] = useState<Instruction>(current.instruction);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [livePlan, setLivePlan] = useState<CheckRequest[]>([]);
  const [landed, setLanded] = useState<Map<string, CheckOutcome>>(new Map());
  const stream = { plan: (p: CheckRequest[]) => { setLivePlan(p); setLanded(new Map()); }, outcome: (o: CheckOutcome) => setLanded((m) => new Map(m).set(o.checkId, o)) };
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(busy);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('case');
    if (wanted && wanted !== caseName && cases.some((c) => c.name === wanted)) pick(wanted);
  }, []);

  function pick(name: string) {
    const next = cases.find((c) => c.name === name);
    if (!next) return;
    setCaseName(name);
    setDraft(next.instruction);
    setRun(null);
    setError(null);
    window.history.replaceState(null, '', `?case=${encodeURIComponent(name)}`);
  }

  const edited = keyOf(draft) !== keyOf(current.instruction);
  const valid = instructionSchema.safeParse(draft).success;
  const latest = run?.steps.at(-1) ?? null;
  const stale = run && run.draftKey !== keyOf(draft);

  async function act(kind: NonNullable<Busy>['kind'], work: () => Promise<void>) {
    setBusy({ kind, started: Date.now() });
    setError(null);
    try { await work(); setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  const replay = () => act('replay', async () => {
    const response = await fetch(`/api/evidence/${current.recorded!.hash}`);
    if (!response.ok) throw new Error('The recorded evidence could not be loaded.');
    setRun({ mode: 'replay', steps: [await response.json() as Issued], release: null, draftKey: keyOf(draft), permalink: null });
  });
  const runLive = () => act('live', async () => {
    setLivePlan([]);
    const issued = await postStream<Issued>('/api/decide', { case: current.name, instruction: instructionSchema.parse(draft) }, stream);
    setRun({ mode: 'live', steps: [issued], release: null, draftKey: keyOf(draft), permalink: null });
  });
  const callback = (outcome: 'confirmed' | 'denied') => act('callback', async () => {
    const next = await post<Issued>('/api/callback', { ...latest!, outcome });
    setRun((r) => (r ? { ...r, steps: [...r.steps, next], permalink: null } : r));
  });
  const retry = () => act('retry', async () => {
    setLivePlan([]);
    const next = await postStream<Issued>('/api/retry', latest!, stream);
    setRun((r) => (r ? { ...r, steps: [...r.steps, next], permalink: null } : r));
  });
  const shareIt = () => act('share', async () => {
    const { permalink } = await post<{ permalink: string }>('/api/share', latest!);
    setRun((r) => (r ? { ...r, permalink } : r));
  });
  const release = () => act('release', async () => {
    const done = await post<Release>('/api/release', { ...latest!, rail: 'sepolia' });
    setRun((r) => (r ? { ...r, release: done } : r));
  });

  const decision = latest?.evidence.decision;

  return (
    <>
      <section className={`wrap ${s.intro}`}>
        <p className="label rise">Attack lab</p>
        <h1 className={`display rise d1 ${s.headline}`}>Try to get a payment past it.</h1>
        <p className="lede rise d2">Open any of the forty benchmark cases, rewrite the email or the change it asks for, and run it. Triad buys only the checks your change makes relevant, through Telegraph. When it wants a callback, you are the person on the trusted line.</p>
      </section>

      <section className={`wrap rise d3 ${s.cases}`}>
        <CasePicker cases={cases} current={current} onPick={pick} />
      </section>

      <section className={`wrap ${s.grid}`}>
        <div className={s.left}>
          <Record shipment={current.shipment} />
          <Editor shipment={current.shipment} draft={draft} setDraft={setDraft} original={current.instruction} />
        </div>

        <aside className={s.right}>
          <div className={`card ${s.desk}`}>
            <div className="card-head"><span className="card-title">The desk</span><span className="mono muted">triad-release-v1</span></div>
            <div className="card-body">
              <Preflight shipment={current.shipment} draft={draft} />
              <div className={s.runs}>
                <button type="button" className="btn primary" disabled={!valid || !live.enabled || Boolean(busy)} onClick={runLive}>{busy?.kind === 'live' ? `Buying checks… ${elapsed.toFixed(0)} s` : 'Run it live'}</button>
                {current.recorded && <button type="button" className="btn secondary" disabled={edited || Boolean(busy)} onClick={replay} title={edited ? 'The recorded run is for the unedited instruction' : ''}>{busy?.kind === 'replay' ? 'Loading…' : 'Replay recorded run'}</button>}
              </div>
              <p className={s.runNote}>
                {!live.enabled ? live.reason : 'Live runs pay real testnet fees through Telegraph and keep every receipt. 10 to 60 seconds.'}
                {current.recorded && edited ? ' The recorded run is for the case as written; reset to replay it.' : ''}
              </p>
              {(busy?.kind === 'live' || busy?.kind === 'retry') && (livePlan.length
                ? <div className={s.liveBox} aria-live="polite"><LiveChecks plan={livePlan} outcomes={landed} elapsed={elapsed} /></div>
                : <div className={s.progress} aria-live="polite"><span className={s.bar} />Reading the instruction against the record. Nothing is released while this runs.</div>)}
              {error && <p className={s.error} role="alert">{error}</p>}
            </div>
          </div>

          {latest && decision && (
            <div ref={resultRef} className={`card ${s.result}`}>
              <div className="card-head"><span className="card-title">{run!.mode === 'live' ? 'Live decision' : 'Recorded decision'}</span><span className="mono muted" title={latest.evidence_sha256}>{noteSerial(latest.evidence_sha256)}</span></div>
              <div className="card-body">
                {stale && <p className={s.stale}>You have edited the instruction since this run.</p>}
                <Decision history={run!.steps.map((x) => x.evidence)} hash={run!.steps.at(-1)!.evidence_sha256} onCallback={callback} onRetry={retry} onShare={run!.mode === 'live' || run!.steps.length > 1 ? shareIt : undefined} permalink={run!.permalink} busy={Boolean(busy)} role="play"
                  atStake={(() => { const v = paperValue(current.shipment.commodity, current.shipment.quantity, prices); return v ? { usd: v, paper: true } : null; })()}>
                  {decision.decision === 'CLEAR' && (
                    <div className={s.releaseBox}>
                      <p className="label">Release on Ethereum Sepolia</p>
                      {run!.release ? (
                        <dl className={s.releaseFacts}>
                          <dt>Paid</dt><dd>{usdc(run!.release.amount)} to <span className="mono">{short(run!.release.payee, 8, 6)}</span></dd>
                          {run!.release.fundTx && <><dt>Funded</dt><dd><a className="mono" href={`https://sepolia.etherscan.io/tx/${run!.release.fundTx}`} target="_blank" rel="noreferrer">{short(run!.release.fundTx)}</a></dd></>}
                          <dt>Released</dt><dd><a className="mono" href={run!.release.explorer} target="_blank" rel="noreferrer">{short(run!.release.releaseTx)}</a></dd>
                          <dt>Signed by</dt><dd className="mono">{short(run!.release.signer, 8, 6)}</dd>
                        </dl>
                      ) : run!.mode === 'live' && latest.seal ? (
                        <>
                          <p className={s.releaseText}>The operator locks {usdc(latest.evidence.shipment.amount.value)} for this run’s shipment. The release officer signs the payee, the amount and this evidence hash; the contract pays exactly that or reverts.</p>
                          <button type="button" className="btn ok" disabled={Boolean(busy)} onClick={release}>{busy?.kind === 'release' ? `Funding and releasing… ${elapsed.toFixed(0)} s` : 'Fund the escrow and release'}</button>
                        </>
                      ) : <p className={s.releaseText}>Recorded runs are not paid again. Run this case live to fund a fresh escrow and release it.</p>}
                    </div>
                  )}
                </Decision>
              </div>
            </div>
          )}
        </aside>
      </section>

      {latest && (
        <section className={`wrap ${s.evidence}`}>
          <div className={s.evidenceHead}>
            <h2 className="h2">The evidence file</h2>
            <a className="btn secondary" download={`triad-${latest.evidence_sha256.slice(2, 14)}.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ evidence_sha256: latest.evidence_sha256, evidence: latest.evidence, attestation: latest.attestation ?? null }, null, 2))}`}>Download it</a>
          </div>
          <EvidenceView evidence={latest.evidence} hash={latest.evidence_sha256} compact attestation={latest.attestation ?? null} issuer={issuer} />
        </section>
      )}
    </>
  );
}
