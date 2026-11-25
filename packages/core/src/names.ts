// Company-name comparison for two jobs: checking that a Telegraph answer is about the entity Triad asked about, and
// checking that a new payee is the seller. Legal-form suffixes and punctuation are noise; distinctive words are not.

const LEGAL_FORMS = new Set([
  'ag', 'sa', 'se', 'nv', 'bv', 'plc', 'ltd', 'limited', 'llc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'gmbh', 'kg', 'ohg', 'sarl', 'srl', 'spa', 'sas', 'oy', 'ab', 'as', 'asa', 'aps', 'kk', 'pty', 'pte', 'lp', 'llp', 'pjsc', 'jsc', 'ojsc',
  'dmcc', 'fze', 'fzco', 'fzc', 'bhd', 'sdn', 'tbk', 'pt', 'cv', 'de', 'the',
  // Russian and CIS forms, as sanctions lists spell them ("PAO", "Joint Stock Company").
  'pao', 'oao', 'zao', 'ooo', 'ao', 'joint', 'stock',
]);

export function nameTokens(name: string): string[] {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    // Dots join abbreviations first, so "S.A." reads as the legal form "sa".
    .replace(/\./g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter((t) => t && !LEGAL_FORMS.has(t));
}

export type NameRelation = 'same' | 'similar' | 'different';

// `same`: identical once legal forms and punctuation are removed. `similar`: most distinctive words shared, which an
// answer may legitimately differ by ("Glencore International" vs "Glencore International AG Baar"). Otherwise `different`.
export function compareNames(a: string, b: string): NameRelation {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.length || !y.length) return 'different';
  if (x.join(' ') === y.join(' ')) return 'same';
  const setX = new Set(x);
  const shared = y.filter((t) => setX.has(t)).length;
  const smaller = Math.min(new Set(x).size, new Set(y).size);
  return smaller >= 1 && shared / smaller >= 0.8 && shared >= Math.min(2, smaller) ? 'similar' : 'different';
}
