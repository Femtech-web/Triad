import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nameTokens } from '@triad/core';
import type { SourceAnswer } from '@triad/core';

// OFAC's Specially Designated Nationals list, matched locally: the official anchor for sanctions checks. A match here
// blocks a release whatever Telegraph's Miners said. Every answer carries the snapshot's hash and retrieval time.

export const SDN_URL = 'https://www.treasury.gov/ofac/downloads/sdn.csv';
export const ALT_URL = 'https://www.treasury.gov/ofac/downloads/alt.csv';

export interface SdnEntry { entNum: string; name: string; type: string; programs: string; names: string[]; imos: string[] }
export interface SdnSnapshot { url: string; sha256: string; retrievedAt: string; entries: number }
export interface SdnMatch { entNum: string; name: string; programs: string; matchedOn: string }

// The CSVs quote fields with double quotes, double them inside, and write empty fields as -0-.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); if (row.some((f) => f.trim())) rows.push(row); }
  return rows.map((r) => r.map((f) => (f.trim() === '-0-' ? '' : f.trim())));
}

export class SdnList {
  private readonly tokenSets: { entry: SdnEntry; name: string; tokens: string[] }[] = [];
  private readonly frequency = new Map<string, number>();
  private readonly byImo = new Map<string, SdnEntry>();

  constructor(readonly entries: SdnEntry[], readonly snapshot: SdnSnapshot) {
    for (const entry of entries) {
      const seen = new Set<string>();
      for (const name of entry.names) {
        const tokens = nameTokens(name);
        if (!tokens.length) continue;
        this.tokenSets.push({ entry, name, tokens });
        for (const t of tokens) seen.add(t);
      }
      for (const t of seen) this.frequency.set(t, (this.frequency.get(t) ?? 0) + 1);
      for (const imo of entry.imos) this.byImo.set(imo, entry);
    }
  }

  static parse(sdnCsv: string, altCsv: string, snapshot: SdnSnapshot): SdnList {
    const entries = new Map<string, SdnEntry>();
    for (const [entNum, name, type, programs, , , , , , , , remarks] of parseCsv(sdnCsv)) {
      if (!entNum || !name) continue;
      entries.set(entNum, { entNum, name, type: type ?? '', programs: programs ?? '', names: [name], imos: [...(remarks ?? '').matchAll(/\bIMO\s*(\d{7})\b/g)].map((m) => m[1]!) });
    }
    for (const [entNum, , , altName] of parseCsv(altCsv)) {
      if (entNum && altName) entries.get(entNum)?.names.push(altName);
    }
    return new SdnList([...entries.values()], { ...snapshot, entries: entries.size });
  }

  // Every token of the queried name must appear in one name of the entry. A one-word query must also be distinctive:
  // at least five letters and found in no more than three entries, so "Global" alone never matches.
  matchName(name: string): SdnMatch[] {
    const query = nameTokens(name);
    if (!query.length) return [];
    if (query.length === 1 && (query[0]!.length < 5 || (this.frequency.get(query[0]!) ?? 0) > 3)) return [];
    const matches = new Map<string, SdnMatch>();
    for (const { entry, name: listed, tokens } of this.tokenSets) {
      const set = new Set(tokens);
      if (query.every((t) => set.has(t)) && !matches.has(entry.entNum)) matches.set(entry.entNum, { entNum: entry.entNum, name: entry.name, programs: entry.programs, matchedOn: listed });
    }
    return [...matches.values()];
  }

  matchImo(imo: string): SdnMatch | null {
    const entry = this.byImo.get(imo.replace(/^IMO/i, ''));
    return entry ? { entNum: entry.entNum, name: entry.name, programs: entry.programs, matchedOn: `IMO ${imo.replace(/^IMO/i, '')}` } : null;
  }

  // The check's answer from the official list. A vessel is matched by IMO first, then by name.
  answer(subject: { kind: 'entity'; name: string } | { kind: 'vessel'; name: string; imo: string }): SourceAnswer {
    const matches = subject.kind === 'vessel' ? [this.matchImo(subject.imo)].filter((m): m is SdnMatch => m !== null) : [];
    if (!matches.length) matches.push(...this.matchName(subject.name));
    const listed = matches.map((m) => `${m.name} (SDN ${m.entNum}; ${m.programs})`).join('; ');
    const asked = subject.kind === 'vessel' ? `${subject.name} (${subject.imo})` : subject.name;
    return {
      kind: 'official', name: 'OFAC SDN list', status: 'answered', purchase: null,
      fields: { matched: matches.length > 0, lists: 'OFAC SDN', matches: listed || null },
      detail: matches.length ? `OFAC's SDN list matches ${asked}: ${listed}.` : `No entry for ${asked} on OFAC's SDN list.`,
      snapshot: { url: this.snapshot.url, sha256: this.snapshot.sha256, retrievedAt: this.snapshot.retrievedAt },
    };
  }
}

const snapshotHash = (sdn: string, alt: string) => createHash('sha256').update(sdn).update('\n--alt--\n').update(alt).digest('hex');
const fromTexts = (sdn: string, alt: string, retrievedAt: string) => SdnList.parse(sdn, alt, { url: SDN_URL, sha256: snapshotHash(sdn, alt), retrievedAt, entries: 0 });

async function download(transport: typeof fetch, signal: AbortSignal): Promise<[string, string]> {
  const get = async (url: string) => {
    const response = await transport(url, { signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`OFAC download failed: HTTP ${response.status} for ${url}`);
    return response.text();
  };
  return Promise.all([get(SDN_URL), get(ALT_URL)]);
}

export async function loadSdnList(transport: typeof fetch = fetch, signal: AbortSignal = AbortSignal.timeout(300_000)): Promise<SdnList> {
  const [sdn, alt] = await download(transport, signal);
  return fromTexts(sdn, alt, new Date().toISOString());
}

// OFAC republishes the list a few times a week and its downloads can take minutes, so a snapshot is reused for a day.
// The hash is recomputed from the cached bytes every time, so evidence always names exactly what was checked.
export async function loadSdnListCached(dir: string, maxAgeMs = 24 * 3600_000, transport: typeof fetch = fetch): Promise<SdnList> {
  const files = { sdn: join(dir, 'sdn.csv'), alt: join(dir, 'alt.csv'), meta: join(dir, 'snapshot.json') };
  try {
    const { retrievedAt } = JSON.parse(await readFile(files.meta, 'utf8')) as { retrievedAt: string };
    if (Date.now() - Date.parse(retrievedAt) < maxAgeMs && (await stat(files.sdn)).size > 0) {
      const [sdn, alt] = await Promise.all([readFile(files.sdn, 'utf8'), readFile(files.alt, 'utf8')]);
      return fromTexts(sdn, alt, retrievedAt);
    }
  } catch { /* no usable cache: download below */ }
  const [sdn, alt] = await download(transport, AbortSignal.timeout(300_000));
  const retrievedAt = new Date().toISOString();
  await mkdir(dir, { recursive: true });
  await Promise.all([writeFile(files.sdn, sdn), writeFile(files.alt, alt), writeFile(files.meta, JSON.stringify({ retrievedAt, sha256: snapshotHash(sdn, alt) }))]);
  return fromTexts(sdn, alt, retrievedAt);
}
