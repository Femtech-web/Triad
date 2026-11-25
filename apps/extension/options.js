import { DEFAULT_BASE, saveSuppliers, settings } from './shared.js';

const list = document.getElementById('list');
const form = document.getElementById('form');
const base = document.getElementById('baseUrl');
let { suppliers, baseUrl } = await settings();
let editing = null;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function render() {
  list.innerHTML = suppliers.length ? suppliers.map((s, i) => `<li class="card row"><div><b>${esc(s.legalName)}</b> <span class="mono muted">${esc(s.domain)}</span><br /><span class="muted small">${esc(s.contactName)} · ${esc(s.contactPhone || s.contactEmail)}</span></div><span class="spacer"></span><button class="btn ghost" data-edit="${i}">Edit</button><button class="btn ghost" data-remove="${i}">Remove</button></li>`).join('')
    : '<li class="muted">No suppliers yet.</li>';
}
list.addEventListener('click', async (e) => {
  const edit = e.target.dataset.edit, remove = e.target.dataset.remove;
  if (edit !== undefined) { editing = Number(edit); for (const [k, v] of Object.entries(suppliers[editing])) if (form.elements[k]) form.elements[k].value = v; document.getElementById('formTitle').textContent = 'Edit supplier'; }
  if (remove !== undefined) { suppliers.splice(Number(remove), 1); await saveSuppliers(suppliers); render(); }
});
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const s = Object.fromEntries(new FormData(form).entries());
  s.domain = s.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  s.country = s.country.trim().toUpperCase();
  if (editing === null) suppliers.push(s); else suppliers[editing] = s;
  editing = null; form.reset(); document.getElementById('formTitle').textContent = 'Add a supplier';
  await saveSuppliers(suppliers); render();
});
form.addEventListener('reset', () => { editing = null; document.getElementById('formTitle').textContent = 'Add a supplier'; });
base.value = baseUrl;
base.addEventListener('change', () => chrome.storage.local.set({ baseUrl: base.value.trim() || DEFAULT_BASE }));
render();
