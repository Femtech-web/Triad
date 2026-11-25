'use client';
import { useEffect, useMemo, useState } from 'react';
import { COUNTRY_NAMES } from '@triad/core';
import type { EvidenceFile } from '@triad/evidence/canonical';
import { Decision } from '@/components/decision';
import { EvidenceView } from '@/components/evidence-view';
import { checkInputSchema, toCase } from '@/lib/check-model';
import type { CheckInput } from '@/lib/check-model';
import { EXAMPLES } from '@/lib/examples';
import { checkTitle, RELATION_LABEL, usdc } from '@/lib/format';
import { preflight } from '@/lib/preflight';
import s from './check.module.css';

interface Issued { evidence: EvidenceFile; evidence_sha256: string; seal?: string }
type Kind = 'payout' | 'pickup' | 'none';
interface Form {
  supplier: { legalName: string; country: string; domain: string; registrationId: string };
  account: { holder: string; number: string };
  contact: { name: string; email: string; phone: string };
  email: { fromName: string; from: string; replyTo: string; message: string };
  change: { kind: Kind; holder: string; number: string; legalName: string; country: string };
}

const EMPTY: Form = {
  supplier: { legalName: '', country: '', domain: '', registrationId: '' }, account: { holder: '', number: '' },
  contact: { name: '', email: '', phone: '' }, email: { fromName: '', from: '', replyTo: '', message: '' },
  change: { kind: 'payout', holder: '', number: '', legalName: '', country: '' },
};
const COUNTRIES = Object.entries(COUNTRY_NAMES).sort(([, a], [, b]) => a.localeCompare(b));
const PRICE_UUSDC = 10_000;

function fromInput(i: CheckInput): Form {
  const c = i.change;
  return {
    supplier: { legalName: i.supplier.legalName, country: i.supplier.country, domain: i.supplier.domain, registrationId: i.supplier.registrationId ?? '' },
    account: { ...i.account }, contact: { name: i.contact.name, email: i.contact.email, phone: i.contact.phone ?? '' },
    email: { fromName: i.email.fromName, from: i.email.from, replyTo: i.email.replyTo ?? '', message: i.email.message },
    change: { ...EMPTY.change, kind: c.kind, ...(c.kind === 'payout' ? { holder: c.holder, number: c.number } : c.kind === 'pickup' ? { legalName: c.legalName, country: c.country } : {}) },
  };
}
const opt = <K extends string>(key: K, v: string) => (v.trim() ? { [key]: v } : {}) as Partial<Record<K, string>>;
function toInput(f: Form): CheckInput {
  return {
    supplier: { legalName: f.supplier.legalName, country: f.supplier.country, domain: f.supplier.domain, ...opt('registrationId', f.supplier.registrationId) },
    account: f.account, contact: { name: f.contact.name, email: f.contact.email, ...opt('phone', f.contact.phone) },
    email: { fromName: f.email.fromName, from: f.email.from, ...opt('replyTo', f.email.replyTo), message: f.email.message },
    change: f.change.kind === 'payout' ? { kind: 'payout', holder: f.change.holder, number: f.change.number }
      : f.change.kind === 'pickup' ? { kind: 'pickup', legalName: f.change.legalName, country: f.change.country } : { kind: 'none' },
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

export function Check() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [example, setExample] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [history, setHistory] = useState<Issued[]>([]);
  const [busy, setBusy] = useState<null | 'check' | 'callback'>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [busy]);

  const parsed = useMemo(() => checkInputSchema.safeParse(toInput(form)), [form]);
  const errors = useMemo(() => {
    const map = new Map<string, string>();
    if (!parsed.success) for (const issue of parsed.error.issues) { const key = issue.path.join('.'); if (!map.has(key)) map.set(key, issue.message); }
    return map;
  }, [parsed]);
  const pre = useMemo(() => {
    if (!parsed.success) return null;
    const { shipment, instruction } = toCase(parsed.data, 'preview');
    return preflight(shipment, instruction);
  }, [parsed]);

  const set = <S extends keyof Form>(section: S, key: keyof Form[S], value: string) => {
    setForm((f) => ({ ...f, [section]: { ...f[section], [key]: value } }));
    setExample(null);
    setHistory([]);
  };
  const load = (id: string) => {
    const found = EXAMPLES.find((e) => e.id === id);
    if (!found) return;
    setForm(fromInput(found.input));
    setExample(id);
    setHistory([]);
    setError(null);
    setAttempted(false);
    setTouched(new Set());
  };
  const show = (path: string) => (attempted || touched.has(path) ? errors.get(path) : undefined);
  const blur = (path: string) => () => setTouched((t) => new Set(t).add(path));

  async function run() {
    setAttempted(true);
    if (!parsed.success) return;
    setBusy('check'); setError(null); setStarted(Date.now()); setNow(Date.now());
    try {
      setHistory([await post<Issued>('/api/check', toInput(form))]);
      if (window.matchMedia('(max-width: 1080px)').matches) setTimeout(() => document.getElementById('check-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  async function answer(outcome: 'confirmed' | 'denied') {
    const latest = history.at(-1);
    if (!latest) return;
    setBusy('callback'); setError(null);
    try { const next = await post<Issued>('/api/callback', { ...latest, outcome }); setHistory((h) => [...h, next]); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  const field = (section: keyof Form, key: string, label: string, opts: { placeholder?: string; mono?: boolean; hint?: string; type?: string } = {}) => {
    const path = `${section}.${key}`;
    const err = show(path);
    return (
      <label className="field">
        <span>{label}</span>
        <input className={`input${opts.mono ? ' mono' : ''}`} type={opts.type ?? 'text'} value={(form[section] as Record<string, string>)[key]} placeholder={opts.placeholder} spellCheck={false}
          aria-invalid={Boolean(err)} onBlur={blur(path)} onChange={(e) => set(section, key as never, e.target.value)} />
        {err ? <span className="error">{err}</span> : opts.hint ? <span className="hint">{opts.hint}</span> : null}
      </label>
    );
  };
  const country = (section: 'supplier' | 'change', label: string) => {
    const path = `${section}.country`;
    const err = show(path);
    return (
      <label className="field">
        <span>{label}</span>
        <select className="select" value={form[section].country} aria-invalid={Boolean(err)} onBlur={blur(path)} onChange={(e) => set(section, 'country', e.target.value)}>
          <option value="">Choose…</option>
          {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        {err && <span className="error">{err}</span>}
      </label>
    );
  };

  const latest = history.at(-1);
  const relation = pre?.changeSet.sender.domain;
  const elapsed = Math.max(0, (now - started) / 1000);

  return (
    <>
      <section className={`wrap ${s.intro}`}>
        <p className="label rise">Check a payment change</p>
        <h1 className={`display rise d1 ${s.title}`}>Is this change safe to act on?</h1>
        <p className="lede rise d2">Tell Triad who you pay and paste the email you received. It checks the sender, buys independent checks on whatever changed, and tells you exactly what to do next.</p>
        <div className={`rise d3 ${s.examples}`}>
          <span className={s.examplesLabel}>Try an example</span>
          <div className="segmented">
            {EXAMPLES.map((e) => <button key={e.id} type="button" aria-pressed={example === e.id} onClick={() => load(e.id)}>{e.label}</button>)}
          </div>
        </div>
      </section>

      <section className={`wrap ${s.grid}`}>
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); void run(); }} noValidate>
          <fieldset className={`card ${s.step}`}>
            <legend className={s.legend}><span className={s.num}>1</span><span><b>Who you pay</b><small>What you had on file before this email arrived.</small></span></legend>
            <div className={s.cols}>
              {field('supplier', 'legalName', 'Supplier’s legal name', { placeholder: 'GLENCORE INTERNATIONAL AG' })}
              {country('supplier', 'Country')}
              {field('supplier', 'domain', 'Their website domain', { placeholder: 'glencore.com', mono: true })}
              {field('supplier', 'registrationId', 'Company ID (optional)', { placeholder: 'LEI or registration number', mono: true })}
              {field('account', 'holder', 'Account holder', { placeholder: 'Name on the account you pay today' })}
              {field('account', 'number', 'Account number or IBAN', { placeholder: 'CH93 0076 2011 6238 5295 7', mono: true })}
            </div>
            <p className={s.sub}>Your contact there</p>
            <div className={s.cols3}>
              {field('contact', 'name', 'Name', { placeholder: 'Treasury desk' })}
              {field('contact', 'email', 'Email', { placeholder: 'treasury@glencore.com', mono: true, type: 'email' })}
              {field('contact', 'phone', 'Phone (recommended)', { placeholder: '+41 41 000 10 05', mono: true, hint: 'Triad tells you to call this number' })}
            </div>
          </fieldset>

          <fieldset className={`card ${s.step}`}>
            <legend className={s.legend}><span className={s.num}>2</span><span><b>The email you received</b><small>Copy the sender exactly as your mail app shows it.</small></span></legend>
            <div className={s.cols}>
              {field('email', 'fromName', 'Sender name', { placeholder: 'Glencore Treasury Desk' })}
              {field('email', 'from', 'Sender address', { placeholder: 'treasury.desk@…', mono: true, type: 'email' })}
            </div>
            {field('email', 'replyTo', 'Reply-to address (if different)', { placeholder: 'Leave empty if there is none', mono: true, type: 'email' })}
            <label className="field">
              <span>Message</span>
              <textarea className="textarea" rows={4} value={form.email.message} placeholder="Paste the email text" aria-invalid={Boolean(show('email.message'))} onBlur={blur('email.message')} onChange={(e) => set('email', 'message', e.target.value)} />
              {show('email.message') && <span className="error">{show('email.message')}</span>}
            </label>
          </fieldset>

          <fieldset className={`card ${s.step}`}>
            <legend className={s.legend}><span className={s.num}>3</span><span><b>What it asks you to change</b><small>Where the money or the cargo would go instead.</small></span></legend>
            <div className="segmented" role="group" aria-label="Kind of change">
              {([['payout', 'Bank account'], ['pickup', 'Pickup agent'], ['none', 'Nothing, just pay']] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={form.change.kind === k} onClick={() => set('change', 'kind', k)}>{label}</button>
              ))}
            </div>
            {form.change.kind === 'payout' && (
              <div className={s.cols}>
                {field('change', 'holder', 'New account holder', { placeholder: 'Name on the new account' })}
                {field('change', 'number', 'New account number or IBAN', { placeholder: 'CH56 0483 5012 3456 7800 9', mono: true })}
              </div>
            )}
            {form.change.kind === 'pickup' && (
              <div className={s.cols}>
                {field('change', 'legalName', 'New agent’s company name', { placeholder: 'PAO Sovcomflot' })}
                {country('change', 'Country')}
              </div>
            )}
            {form.change.kind === 'none' && <p className={s.none}>Triad still checks who sent it. If nothing changed, nothing needs buying.</p>}
          </fieldset>

          <div className={s.submit}>
            <button type="submit" className="btn primary lg" disabled={Boolean(busy)}>{busy === 'check' ? `Checking… ${elapsed.toFixed(0)} s` : history.length ? 'Check again' : 'Check it'}</button>
            <p className="muted">Checks are bought live from Telegraph’s testnet. Free for you, and nothing is paid from this page.</p>
          </div>
        </form>

        <aside id="check-result" className={s.side} aria-live="polite">
          <div className={`card ${s.panel}`}>
            {busy === 'check' ? (
              <div className={s.running}>
                <p className="label">Checking</p>
                <p className={s.runningTitle}>Asking independent sources…</p>
                <ul className={s.plan}>
                  {(pre?.plan ?? []).map((c) => <li key={c.id}><span className={s.spinner} aria-hidden="true" />{checkTitle(c.id)}</li>)}
                </ul>
                <p className="muted">{elapsed.toFixed(0)} s · usually 10 to 40 seconds</p>
              </div>
            ) : latest ? (
              <>
                <Decision history={history.map((h) => h.evidence)} onCallback={answer} busy={busy === 'callback'} />
                <div className={s.panelFoot}>
                  <a className="btn secondary sm" download={`triad-${latest.evidence_sha256.slice(2, 14)}.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ evidence_sha256: latest.evidence_sha256, evidence: latest.evidence }, null, 2))}`}>Download evidence</a>
                  <span className="mono muted">{latest.evidence.cost.purchases} checks · {usdc(latest.evidence.cost.telegraphUusdc)}</span>
                </div>
              </>
            ) : pre ? (
              <div className={s.preview}>
                <p className="label">Before anything is bought</p>
                <div className={s.previewRow}>
                  <span className={`chip ${pre.blocked ? 'block' : relation?.relation === 'same' || relation?.relation === 'subdomain' ? 'clear' : 'hold'}`}>{relation ? RELATION_LABEL[relation.relation] : 'no domain'}</span>
                  <span>{relation?.reason}</span>
                </div>
                {pre.hits.some((h) => h.text !== relation?.reason) && <ul className={s.preHits}>{pre.hits.filter((h) => h.text !== relation?.reason).map((h, i) => <li key={i}><span className={`chip ${h.effect === 'block' ? 'block' : 'hold'}`}>{h.effect === 'block' ? 'blocks' : 'needs callback'}</span>{h.text}</li>)}</ul>}
                <p className={s.planHead}>{pre.blocked ? 'Blocked from the email alone. Nothing needs buying.' : pre.plan.length ? `Triad will buy ${pre.plan.length} independent check${pre.plan.length === 1 ? '' : 's'} (up to ${usdc(pre.maxCalls * PRICE_UUSDC)} on testnet):` : 'Nothing changed, so nothing needs buying.'}</p>
                {pre.plan.length > 0 && <ul className={s.planList}>{pre.plan.map((c) => <li key={c.id}><span>{checkTitle(c.id)}</span><span className="chip">{c.required ? 'two sources' : 'optional'}</span></li>)}</ul>}
              </div>
            ) : (
              <div className={s.empty}>
                <span className={s.emptyIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.3 7.5 9.5 4.4-1.2 7.5-5.1 7.5-9.5V6L12 3Z" /></svg></span>
                <p className={s.emptyTitle}>Your answer appears here</p>
                <p className="muted">Fill in the three steps, or load an example above. Triad reacts as you type, before anything is bought.</p>
              </div>
            )}
            {error && <p className={s.error} role="alert">{error}</p>}
          </div>
        </aside>
      </section>

      {latest && (
        <section className={`wrap ${s.evidence}`}>
          <details className={`card ${s.details}`}>
            <summary>
              <span><b>The evidence file</b><span className="muted"> · every check, every source, every receipt</span></span>
              <span className="mono muted">{latest.evidence_sha256.slice(0, 18)}…</span>
            </summary>
            <div className={s.detailsBody}><EvidenceView evidence={latest.evidence} hash={latest.evidence_sha256} compact /></div>
          </details>
        </section>
      )}
    </>
  );
}
