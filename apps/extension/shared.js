// Shared by the popup and the options page. Suppliers live only in this browser (chrome.storage.local).
export const DEFAULT_BASE = 'https://triad-five-steel.vercel.app';

export async function settings() {
  const { suppliers = [], baseUrl = DEFAULT_BASE } = await chrome.storage.local.get(['suppliers', 'baseUrl']);
  return { suppliers, baseUrl };
}
export const saveSuppliers = (suppliers) => chrome.storage.local.set({ suppliers });

const domainOf = (address) => (address || '').slice(address.lastIndexOf('@') + 1).toLowerCase();
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// The supplier this email claims to be from: the exact domain, else a name it borrows, else the nearest domain. A
// look-alike sender never matches exactly, which is the point: the person confirms the supplier in the popup.
export function bestSupplier(suppliers, email) {
  const domain = domainOf(email.from);
  const exact = suppliers.find((s) => s.domain === domain);
  if (exact) return exact;
  const words = `${email.fromName} ${domain}`.toLowerCase();
  const byName = suppliers.find((s) => s.legalName.toLowerCase().split(/\s+/).some((w) => w.length > 3 && words.includes(w)));
  if (byName) return byName;
  const near = suppliers.map((s) => ({ s, d: distance(domain.split('.')[0], s.domain.split('.')[0]) })).sort((a, b) => a.d - b.d)[0];
  return near && near.d <= 3 ? near.s : null;
}

export const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/;

export function prefillUrl(baseUrl, supplier, email, change, amountUsd) {
  const body = {
    supplier: supplier ? { legalName: supplier.legalName, country: supplier.country, domain: supplier.domain, registrationId: supplier.registrationId || '' } : {},
    account: supplier ? { holder: supplier.accountHolder, number: supplier.accountNumber } : {},
    contact: supplier ? { name: supplier.contactName, email: supplier.contactEmail, phone: supplier.contactPhone || '' } : {},
    email: { fromName: email.fromName || '', from: email.from || '', replyTo: email.replyTo || '', message: [email.subject, email.message].filter(Boolean).join('\n\n').slice(0, 2000) },
    change, amountUsd: amountUsd || '',
  };
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${baseUrl.replace(/\/$/, '')}/check#prefill=${b64}`;
}

// Runs inside the mail page when the person clicks the icon: the open message's sender, subject and text.
export function extractEmail() {
  const text = (el) => (el?.innerText || el?.textContent || '').trim();
  if (location.hostname === 'mail.google.com') {
    const senders = [...document.querySelectorAll('span.gD[email]')];
    const sender = senders[senders.length - 1];
    const bodies = [...document.querySelectorAll('div.a3s')];
    return sender ? { client: 'gmail', from: sender.getAttribute('email'), fromName: sender.getAttribute('name') || text(sender), subject: text(document.querySelector('h2.hP')), message: text(bodies[bodies.length - 1]) } : null;
  }
  const pane = document.querySelector('[aria-label="Reading Pane"], [role="main"]') || document.body;
  const persona = pane.querySelector('[aria-label^="From"], [data-testid="SenderPersona"], span[title*="@"], [title*="@"]');
  const label = `${persona?.getAttribute('title') || ''} ${persona?.getAttribute('aria-label') || ''} ${text(persona)}`;
  const address = (label.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || text(pane).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [])[0];
  if (!address) return null;
  const name = text(persona).replace(/<?[\w.+-]+@[\w.-]+>?/, '').replace(/^From:?/i, '').trim();
  const body = pane.querySelector('[aria-label="Message body"], div[role="document"]');
  const subject = pane.querySelector('[role="heading"][aria-level="2"], [id$="_SUBJECT"], .allowTextSelection [role="heading"]');
  return { client: 'outlook', from: address, fromName: name, subject: text(subject), message: text(body) };
}
