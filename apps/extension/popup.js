import { bestSupplier, extractEmail, IBAN, prefillUrl, settings } from './shared.js';

const app = document.getElementById('app');
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function readEmail() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(mail\.google\.com|outlook\.(office|office365|live)\.com)\//.test(tab.url || '')) return null;
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractEmail });
  return result?.result ?? null;
}

const { suppliers, baseUrl } = await settings();
const email = await readEmail().catch(() => null);

if (!email) {
  app.replaceChildren(el(`<div class="stack"><p>Open an email in <b>Gmail</b> or <b>Outlook on the web</b>, then click the Triad icon.</p><p class="muted">Or check one by hand:</p><a class="btn" target="_blank" href="${esc(baseUrl)}/check">Open Triad's check</a><a class="link" href="options.html" target="_blank">Your suppliers (${suppliers.length})</a></div>`));
} else {
  const match = bestSupplier(suppliers, email);
  const iban = (email.message.match(IBAN) || [])[0]?.replace(/\s+/g, '') || '';
  app.replaceChildren(el(`
    <form class="stack" id="form">
      <section class="mail">
        <p class="label">This email</p>
        <p><b>${esc(email.fromName)}</b> <span class="mono">&lt;${esc(email.from)}&gt;</span></p>
        <p class="muted">${esc(email.subject || '(no subject)')}</p>
      </section>
      <label>Which supplier does it claim to be?
        <select id="supplier"><option value="">Not in my list</option>${suppliers.map((s, i) => `<option value="${i}" ${s === match ? 'selected' : ''}>${esc(s.legalName)} · ${esc(s.domain)}</option>`).join('')}</select>
      </label>
      <label>What does it ask you to change?
        <select id="kind"><option value="payout" ${iban ? 'selected' : ''}>Bank account</option><option value="pickup">Pickup agent</option><option value="none" ${iban ? '' : 'selected'}>Nothing, just pay</option></select>
      </label>
      <div id="payout" class="stack tight">
        <input id="holder" placeholder="New account holder" />
        <input id="number" class="mono" placeholder="New account number or IBAN" value="${esc(iban)}" />
      </div>
      <div id="pickup" class="stack tight" hidden><input id="agent" placeholder="New agent's company" /><input id="agentCountry" class="mono" maxlength="2" placeholder="Country (ISO, e.g. RU)" /></div>
      <input id="amount" class="mono" placeholder="Payment amount in USD (optional)" />
      <button class="btn" type="submit">Check with Triad</button>
      <p class="muted small">Opens Triad with this filled in. Nothing is sent until you press "Check it" there. <a class="link" href="options.html" target="_blank">Your suppliers (${suppliers.length})</a></p>
    </form>`));
  const kind = document.getElementById('kind');
  const toggle = () => { document.getElementById('payout').hidden = kind.value !== 'payout'; document.getElementById('pickup').hidden = kind.value !== 'pickup'; };
  kind.addEventListener('change', toggle); toggle();
  const chosen = () => { const i = document.getElementById('supplier').value; return i === '' ? null : suppliers[Number(i)]; };
  document.getElementById('holder').value = match?.accountHolder ?? '';
  document.getElementById('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const v = (id) => document.getElementById(id).value.trim();
    const change = kind.value === 'payout' ? { kind: 'payout', holder: v('holder'), number: v('number') }
      : kind.value === 'pickup' ? { kind: 'pickup', legalName: v('agent'), country: v('agentCountry').toUpperCase() } : { kind: 'none' };
    chrome.tabs.create({ url: prefillUrl(baseUrl, chosen(), email, change, v('amount')) });
    window.close();
  });
}
