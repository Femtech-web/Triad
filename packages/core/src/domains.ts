// How an instruction's sender domain relates to the domain the trusted record holds for that counterparty.
// Lookalike domains are the most common payment-redirection lure, and they are checkable without any network call.

// Two-label public suffixes common in trade correspondence. Unlisted ones fall back to the last label, which only
// makes the registrable domain longer, never wrongly equal.
const TWO_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'com.au', 'com.sg', 'com.hk', 'com.br', 'com.cn', 'com.my', 'com.tr', 'com.mx', 'com.ar', 'co.jp', 'co.kr', 'co.in',
  'co.za', 'co.nz', 'co.id', 'com.ng', 'com.ph', 'com.vn', 'com.sa', 'ac.uk', 'gov.uk', 'ne.jp', 'or.jp',
]);
const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'aol.com', 'icloud.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'mail.com', 'yandex.com', 'zoho.com', 'qq.com', '163.com']);
// Characters and pairs that read alike in a mail client.
const CONFUSABLES: [RegExp, string][] = [[/rn/g, 'm'], [/vv/g, 'w'], [/cl/g, 'd'], [/0/g, 'o'], [/1/g, 'l'], [/[il|]/g, 'l'], [/5/g, 's'], [/3/g, 'e']];

export type DomainRelation = 'same' | 'subdomain' | 'lookalike' | 'brand_in_other_domain' | 'free_mail' | 'unrelated';

export interface DomainComparison { relation: DomainRelation; sender: string; trusted: string; reason: string }

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  const lastTwo = labels.slice(-2).join('.');
  return labels.slice(TWO_LABEL_SUFFIXES.has(lastTwo) ? -3 : -2).join('.');
}

function splitDomain(registrable: string): { label: string; suffix: string } {
  const at = registrable.indexOf('.');
  return { label: registrable.slice(0, at), suffix: registrable.slice(at + 1) };
}

function skeleton(label: string): string {
  return CONFUSABLES.reduce((s, [pattern, replacement]) => s.replace(pattern, replacement), label.replace(/-/g, ''));
}

export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length]!;
}

export function compareDomains(senderHost: string, trustedHost: string): DomainComparison {
  const sender = registrableDomain(senderHost);
  const trusted = registrableDomain(trustedHost);
  const base = { sender, trusted };
  if (senderHost.toLowerCase() === trustedHost.toLowerCase() || sender === trusted) {
    return senderHost.toLowerCase().endsWith(`.${trustedHost.toLowerCase()}`)
      ? { ...base, relation: 'subdomain', reason: `${senderHost} is a subdomain of ${trustedHost}` }
      : { ...base, relation: 'same', reason: `${senderHost} is the trusted domain` };
  }
  if (sender.startsWith('xn--') || senderHost.includes('.xn--')) return { ...base, relation: 'lookalike', reason: `${senderHost} uses an internationalised (punycode) name, a common way to imitate ${trusted}` };
  if (FREE_MAIL.has(sender)) return { ...base, relation: 'free_mail', reason: `${sender} is a free mail provider, not ${trusted}` };
  const s = splitDomain(sender);
  const t = splitDomain(trusted);
  if (s.label === t.label) return { ...base, relation: 'lookalike', reason: `${sender} has the trusted name with a different ending (${t.suffix} → ${s.suffix})` };
  if (skeleton(s.label) === skeleton(t.label)) return { ...base, relation: 'lookalike', reason: `${sender} reads like ${trusted} (look-alike characters)` };
  const distance = editDistance(s.label, t.label);
  if (t.label.length >= 5 && distance <= (t.label.length >= 9 ? 2 : 1)) return { ...base, relation: 'lookalike', reason: `${sender} differs from ${trusted} by ${distance} character${distance === 1 ? '' : 's'}` };
  if (t.label.length >= 4 && s.label.includes(t.label)) return { ...base, relation: 'brand_in_other_domain', reason: `${sender} contains the trusted name "${t.label}" but is a different domain` };
  return { ...base, relation: 'unrelated', reason: `${sender} is not related to ${trusted}` };
}
