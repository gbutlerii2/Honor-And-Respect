import { SAMPLE, view } from './data.js';
import { SITE_URL } from './firebase-config.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'kit';
const defaultBase = params.get('base') || (location.protocol.startsWith('http') && !/localhost|127\.0\.0\.1/.test(location.hostname) ? location.origin : SITE_URL);
const baseInput = document.getElementById('base');
baseInput.value = defaultBase;

const TEST_STONES = ['NAC-D-14-22', 'ANC-21-412', 'ANC-12-3307', 'NAC-F-3-9', 'NAC-A-2-17', 'ANC-34-1207'];

function qr(url) {
  try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); return q.createDataURL(10, 0); } catch (e) { return ''; }
}
function plaques(items, base) {
  const pages = [];
  for (let i = 0; i < items.length; i += 6) pages.push(items.slice(i, i + 6));
  return pages.map((pg, n) => `<section class="sheet"><h3>QR plaques${pages.length > 1 ? ` · ${n + 1} of ${pages.length}` : ''}</h3><div class="note">Each code opens ${esc(base)}/m/&lt;ID&gt;. Cut along the borders.</div>
    <div class="grid">${pg.map(it => { const url = `${base}/m/${encodeURIComponent(it.id)}`; return `<div class="plaque"><img src="${qr(url)}" alt="QR code for ${esc(it.name)}"><div class="nm">${esc(it.name)}</div><div class="yr">${esc(it.lifespan || '')}</div><div class="lc">${esc([it.cemetery, it.location].filter(Boolean).join(' · '))}</div><div class="id">Honor and Respect · ${esc(it.id)}</div><div class="cut">Scan to open the memorial</div></div>`; }).join('')}</div></section>`).join('');
}
function stones() {
  return TEST_STONES.map(id => SAMPLE.find(m => m.id === id)).filter(Boolean).map(m => `<section class="sheet stone-page"><div class="stone"><div class="cross"><i></i></div>${m.inscription.map(l => `<div class="ln">${esc(l)}</div>`).join('')}</div><div class="stone-foot"><span>Test headstone · sample record ${esc(m.id)}</span><span>Honor and Respect print kit</span></div></section>`).join('');
}
function cover(base) {
  return `<section class="sheet cover"><div class="kick">Honor and Respect</div><h2>Test kit</h2>
    <ol>
      <li><strong>Load the sample data first.</strong> In the app, sign in as an admin, open Admin → Data &amp; QR, and choose “Load sample data”. In demo mode the sample data is already loaded.</li>
      <li><strong>Headstones (pages 2–7).</strong> Lay a page flat or tape it to a wall in even light. In the app, open Scan → Headstone → Take photo. Fill the frame with the stone. The correct record should rank first; the Walter A. Haskins and William J. Hoskins pages test near-duplicate names.</li>
      <li><strong>QR plaques (last pages).</strong> Point the iPhone Camera app at a code to open the memorial directly, or use Scan → QR code inside the app.</li>
      <li>The codes on this printout open <strong>${esc(base)}</strong>. Change the address at the top of this page before printing if you are testing on a different site, such as your Netlify preview address.</li>
    </ol>
    <p class="note" style="margin-top:auto">All names, dates and records in this kit are fictional sample data.</p></section>`;
}
function render() {
  const base = baseInput.value.trim().replace(/\/+$/, '') || SITE_URL;
  let html;
  if (mode === 'qr') {
    let items = [];
    try { items = JSON.parse(localStorage.getItem('har-print') || '[]'); } catch { }
    if (!items.length) items = SAMPLE.map(m => { const v = view(m); return { id: m.id, name: v.name, lifespan: v.lifespan, location: m.location, cemetery: m.cemetery }; });
    html = plaques(items, base);
  } else {
    const items = SAMPLE.map(m => { const v = view(m); return { id: m.id, name: v.name, lifespan: v.lifespan, location: m.location, cemetery: m.cemetery }; });
    html = cover(base) + stones() + plaques(items, base);
  }
  document.getElementById('out').innerHTML = html;
}
document.getElementById('apply').onclick = render;
if (window.qrcode) render(); else window.addEventListener('load', render);
