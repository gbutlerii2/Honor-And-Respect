import { firebaseConfig, SITE_URL, ENABLE_GOOGLE_SIGNIN, OWNER_EMAIL, USERNAME_DOMAIN, RECAPTCHA_SITE_KEY } from './firebase-config.js';
const toEmail = s => { s = String(s || '').trim().toLowerCase(); return s.includes('@') ? s : `${s}@${USERNAME_DOMAIN}`; };
import { SAMPLE, CEMETERIES, STATUS, view } from './data.js';
import { US, cemCountries, cemStates, cemIn, cemGroups } from './cemeteries.js';
import { rankCandidates, guessSurname } from './match.js';
import { LocalAPI, makeFireAPI } from './api.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const configured = !!(firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_'));
const I = (d, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  back: I('<path d="m15 18-6-6 6-6"/>', 22),
  scan: I('<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>', 23),
  search: I('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 23),
  bookmark: I('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>', 21),
  user: I('<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>', 23),
  shield: I('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>', 23),
  pencil: I('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>', 18),
  link: I('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', 18),
  pin: I('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>', 18),
  history: I('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>', 21),
  qr: I('<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>', 21),
  chev: I('<path d="m9 18 6-6-6-6"/>', 18),
  down: I('<path d="m6 9 6 6 6-6"/>', 18),
  camera: I('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>', 22),
  check: I('<path d="M20 6 9 17l-5-5"/>', 14)
};
const ROLES = [['reader', 'Reader', 'Scan, search and read memorials.'], ['contributor', 'Contributor', 'Suggest edits, add photos and citations. An editor reviews each change.'], ['editor', 'Editor', 'Publish edits directly, link records and approve suggestions.'], ['admin', 'Admin', 'Manage roles, generate QR plaques, import data and moderate.']];

let api, user = null;
const role = () => (user ? user.role || 'contributor' : 'reader');
const isEditor = () => ['editor', 'admin'].includes(role());
const isAdmin = () => role() === 'admin';
const qrBase = () => (location.protocol.startsWith('http') && !/localhost|127\.0\.0\.1/.test(location.hostname) && location.origin !== SITE_URL ? location.origin : SITE_URL);

// ---------- helpers ----------
const set = html => { $('#view').innerHTML = html; };
const loading = () => set('<div class="loading">Loading…</div>');
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }
const store = { get: k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
// ---------- selected cemetery (kept on this device) ----------
const CEM_KEY = 'har-cemetery';
function getCem() { try { const k = localStorage.getItem(CEM_KEY); return CEMETERIES[k] ? k : ''; } catch { return ''; } }
function setCem(k) { try { localStorage.setItem(CEM_KEY, k); } catch { } reg.cemetery = CEMETERIES[k] ? CEMETERIES[k].name : ''; reg.limit = 50; }
const cemName = () => (CEMETERIES[getCem()] || {}).name || '';
// Scan matches are limited to the selected cemetery, so a stone in Normandy never matches an Arlington record.
const scoped = list => { const n = cemName(); return n ? list.filter(m => m.cemetery === n) : list; };
// Cascading picker: Select Country, then (United States only) Select State, then Select Cemetery.
// Used on the welcome page and in the "change" pop-up. `cur` is the selected cemetery key, if any.
const optList = (items, cur, ph) => `<option value="" ${cur ? '' : 'selected'} disabled>${ph}</option>` + items.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
function cascadeHTML(id, cur) {
  const c = CEMETERIES[cur] || {};
  return `<div class="cascade" id="${id}">
    <div class="field"><label for="${id}-country">Select Country</label><select class="input" id="${id}-country" data-c="country">${optList(cemCountries().map(x => [x, x]), c.country || '', 'Choose a country…')}</select></div>
    <div class="field" data-wrap="state" hidden><label for="${id}-state">Select State</label><select class="input" id="${id}-state" data-c="state"></select></div>
    <div class="field"><label for="${id}-cem">Select Cemetery</label><select class="input" id="${id}-cem" data-c="cem" disabled></select></div>
  </div>`;
}
// Wires a cascade rendered by cascadeHTML. onPick(key) runs whenever the chosen cemetery changes ('' when none).
function wireCascade(id, cur, onPick) {
  const root = $('#' + id), [cs, ss, ks] = ['country', 'state', 'cem'].map(k => root.querySelector(`[data-c="${k}"]`));
  const sw = root.querySelector('[data-wrap="state"]');
  const fillCems = key => {
    const country = cs.value, needState = country === US;
    const list = !country || (needState && !ss.value) ? [] : cemIn(country, needState ? ss.value : '');
    if (!key && list.length === 1) key = list[0][0]; // only one cemetery there: pick it
    ks.innerHTML = optList(list.map(([k, c]) => [k, c.name]), key, !country ? 'Choose a country first' : needState && !ss.value ? 'Choose a state first' : 'Choose a cemetery…');
    ks.disabled = !list.length;
    onPick(ks.value || '');
  };
  const fillStates = (state, key) => {
    const isUS = cs.value === US;
    sw.hidden = !isUS;
    if (isUS) {
      const states = cemStates(US);
      if (!state && states.length === 1) state = states[0];
      ss.innerHTML = optList(states.map(x => [x, x]), state, 'Choose a state…');
    } else ss.innerHTML = '';
    fillCems(key);
  };
  cs.onchange = () => fillStates('', '');
  ss.onchange = () => fillCems('');
  ks.onchange = () => onPick(ks.value || '');
  const c = CEMETERIES[cur];
  fillStates(c ? c.state : '', c ? cur : '');
  return cs;
}
// Pop-up picker used by the "change" link on the scan page.
function openCemPicker(after) {
  const old = $('#cemModal'); if (old) old.parentNode.removeChild(old);
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="cemModal" role="dialog" aria-modal="true" aria-labelledby="cemModalT"><div class="modal-card">
    <div class="kicker">Honor and Respect</div><h2 id="cemModalT">Select cemetery</h2>
    ${cascadeHTML('cemModalPick', getCem())}
    <div class="btnrow"><button class="btn btn-secondary" id="cemCancel" type="button">Cancel</button><button class="btn btn-primary" id="cemOk" type="button">Select</button></div></div></div>`);
  const modal = $('#cemModal');
  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  modal.onclick = e => { if (e.target === modal) close(); };
  $('#cemCancel').onclick = close;
  let picked = '';
  const first = wireCascade('cemModalPick', getCem(), k => { picked = k; $('#cemOk').disabled = !k; });
  $('#cemOk').onclick = () => { if (!picked) return; close(); if (picked !== getCem()) { setCem(picked); toast(CEMETERIES[picked].name + ' selected'); } if (after) after(); };
  first.focus();
}
function loadScript(src) { return new Promise((res, rej) => { if ($(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
const backBtn = (label = 'Back') => `<button class="back" data-back>${ICON.back}${esc(label)}</button>`;
function goBack(fallback = '#/register') { if (history.length > 1) history.back(); else location.hash = fallback; }
function needAuth(msg) { toast(msg); location.hash = '#/account'; }
function fmtDate(t) { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function rowHTML(m) {
  const v = view(m);
  return `<a class="row" href="#/m/${encodeURIComponent(m.id)}"><div class="t"><span class="n">${esc(v.name)}</span><span class="y">${esc(v.lifespan)}</span></div><div class="r">${esc(v.rankLine)}</div><div class="b"><span>${esc((CEMETERIES[m.cemeteryKey] ? CEMETERIES[m.cemeteryKey].short : m.cemetery) || '')} · ${esc(m.location || '')}</span><span class="tag sm ${v.statusClass}">${v.statusLabel}</span></div></a>`;
}
function stoneHTML(lines) {
  return `<div class="stone"><div class="cross"><i></i></div>${lines.map(l => `<div class="ln">${esc(l)}</div>`).join('')}</div>`;
}
function inscriptionOf(m) {
  if (m.inscription && m.inscription.length) return m.inscription;
  const v = view(m);
  return [v.name.toUpperCase(), [m.rankAbbr, m.branch].filter(Boolean).join(' ').toUpperCase(), (m.enteredFrom || '').toUpperCase(), (m.deathDate || '').toUpperCase()].filter(Boolean);
}

// ---------- tabs / router ----------
function renderTabs(h) {
  const root = h.split('/')[0].split('?')[0];
  const cur = root === 'm' ? 'register' : root;
  const tabs = [['scan', 'Scan', ICON.scan], ['register', 'Register', ICON.search], ['saved', 'Saved', ICON.bookmark.replace('21', '23').replace('21', '23')], ['account', 'Account', ICON.user]];
  if (isEditor()) tabs.push(['admin', isAdmin() ? 'Admin' : 'Review', ICON.shield]);
  $('#tabs').innerHTML = tabs.map(([k, l, ic]) => `<a class="tab ${cur === k ? 'on' : ''}" href="#/${k}">${ic}<span>${l}</span></a>`).join('');
}
let stopCamera = () => { };
async function route() {
  stopCamera(); stopCamera = () => { };
  let raw = location.hash.replace(/^#\/?/, '').split('#')[0] || 'scan';
  // First visit (no cemetery chosen yet): the scan page starts at the welcome page.
  if (raw.split('?')[0] === 'scan' && !getCem()) raw = 'welcome';
  const [h, qs] = raw.split('?');
  const params = new URLSearchParams(qs || '');
  document.body.classList.toggle('wide', h.startsWith('admin'));
  document.body.classList.toggle('dark', h === 'scan');
  document.body.classList.toggle('splash', h === 'welcome');
  renderTabs(h);
  window.scrollTo(0, 0);
  const p = h.split('/').map(decodeURIComponent);
  try {
    if (p[0] === 'welcome') return viewWelcome();
    if (p[0] === 'scan') return viewScan();
    if (p[0] === 'register') return viewRegister(params);
    if (p[0] === 'm' && p[1]) {
      if (!p[2]) return viewMemorial(p[1]);
      if (p[2] === 'edit') return viewEdit(p[1]);
      if (p[2] === 'history') return viewHistory(p[1]);
      if (p[2] === 'records') return viewRecords(p[1]);
      if (p[2] === 'location') return viewLocation(p[1]);
    }
    if (p[0] === 'confirm' && p[1] && p[2]) return viewConfirm(p[1], p[2]);
    if (p[0] === 'saved') return viewSaved(params);
    if (p[0] === 'account') return viewAccount();
    if (p[0] === 'admin') return p[1] === 'new' ? viewEdit(null) : viewAdmin(p[1] || 'listing', params);
    location.hash = '#/scan';
  } catch (e) { console.error(e); set(`<div class="pad"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p></div>`); }
}
document.addEventListener('click', e => { if (e.target.closest('[data-back]')) { e.preventDefault(); goBack(); } });

// ---------- welcome ----------
// Hero photo: put a photo at public/img/normandy-cemetery.jpg and fill in the credit line.
// Until that file exists, the page shows a drawn illustration of rows of crosses instead.
const HERO = { src: 'img/normandy-cemetery.jpg', alt: 'Rows of white marble crosses at the Normandy American Cemetery, Colleville-sur-Mer', credit: '' };
function heroArt() {
  // Rows of Latin crosses receding toward the horizon. Original drawing, no licence needed.
  let crosses = '';
  for (let r = 0; r < 7; r++) {
    const t = r / 6, y = 150 + t * t * 120 + t * 40, k = 0.35 + t * 1.15, gap = 34 * k;
    const off = (r % 2) * gap / 2;
    for (let x = -gap + off; x < 640 + gap; x += gap) {
      const w = 3.2 * k, h = 22 * k, aw = 13 * k, ay = y - h * 0.72;
      crosses += `<g opacity="${(0.55 + t * 0.45).toFixed(2)}"><rect x="${(x - w / 2).toFixed(1)}" y="${(y - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/><rect x="${(x - aw / 2).toFixed(1)}" y="${(ay - w / 2).toFixed(1)}" width="${aw.toFixed(1)}" height="${w.toFixed(1)}"/></g>`;
    }
  }
  return `<svg class="hero-art" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of rows of white crosses on a lawn under an evening sky">
    <defs><linearGradient id="hsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4a63"/><stop offset=".6" stop-color="#c99a6a"/><stop offset="1" stop-color="#ecd2a6"/></linearGradient>
    <linearGradient id="hgrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6b45"/><stop offset="1" stop-color="#2f3a24"/></linearGradient></defs>
    <rect width="640" height="360" fill="url(#hsky)"/>
    <path d="M0 140 Q 120 128 240 136 T 460 132 T 640 138 V 150 H 0 Z" fill="#4a5640" opacity=".9"/>
    <rect y="146" width="640" height="214" fill="url(#hgrass)"/>
    <g fill="#f4f1ea">${crosses}</g></svg>`;
}
function viewWelcome() {
  const cur = getCem();
  set(`<section class="welcome">
    <figure class="hero">${heroArt()}<img id="heroImg" alt="${esc(HERO.alt)}" hidden><figcaption id="heroCredit" hidden></figcaption></figure>
    <div class="pad welcome-body">
      <h1 class="welcome-title">Honor and Respect</h1>
      <div class="cem-pick">
        ${cascadeHTML('cemPick', cur)}
        <button class="btn btn-primary btn-block big" id="cemGo" ${cur ? '' : 'disabled'}>Continue</button>
      </div>
      <h4 class="sec">About</h4>
      <div class="bio">
        <p>Honor and Respect helps visitors learn the stories of the men and women who rest in America’s military cemeteries. Point your phone at a headstone, or scan a QR plaque, and the register opens that service member’s memorial page: name, rank, unit, hometown and dates of service, linked to public records from the American Battle Monuments Commission, Arlington National Cemetery and the National Archives.</p>
        <p>The register is a shared effort. Families, historians and volunteers can add photographs, biographies and sources, and an editor reviews every change before it appears, so each record stays accurate and respectful.</p>
        <p>Use it to plan a visit, to find a relative, or simply to pause at a stone and learn who lies there. Choose a cemetery above to begin.</p>
      </div>
      <div class="btnrow center"><a class="linkbtn" href="guide.html">User guide</a></div>
    </div></section>`);
  const img = $('#heroImg');
  img.onload = () => { img.hidden = false; $('.hero-art').style.display = 'none'; if (HERO.credit) { const c = $('#heroCredit'); c.textContent = HERO.credit; c.hidden = false; } };
  img.src = HERO.src;
  const go = $('#cemGo');
  let picked = '';
  wireCascade('cemPick', cur, k => { picked = k; go.disabled = !k; });
  go.onclick = () => { if (!picked) return; setCem(picked); if (/^#\/?scan$/.test(location.hash)) route(); else location.hash = '#/scan'; };
}

// ---------- scan ----------
let scanMode = 'stone';
function viewScan() {
  set(`<section class="scan">
    <div class="kicker light">Honor and Respect</div>
    <h2>${scanMode === 'stone' ? 'Scan a headstone' : 'Scan a QR plaque'}</h2>
    <div class="seg-dark"><button data-mode="stone" class="${scanMode === 'stone' ? 'on' : ''}">Headstone</button><button data-mode="qr" class="${scanMode === 'qr' ? 'on' : ''}">QR code</button></div>
    <div class="cem-bar"><span class="cem-name">${esc(cemName())}</span><button class="cem-change" id="cemChange" type="button">change</button></div>
    ${scanMode === 'stone' ? `
      <div class="finder" id="finder"><video id="vid" playsinline muted></video><div class="reticle stone-ret"></div><div class="finder-empty" id="liveIdle">${ICON.scan}<p>Live scan reads the inscription while you hold the phone steady. Fill the frame with the stone.</p></div><div class="live-text" id="liveText" hidden></div><div class="live-match" id="liveMatch" hidden></div></div>
      <div class="scan-actions"><button class="btn btn-light" id="startLive">${ICON.scan.replace(/23/g, '18')}Start live scan</button></div>
      <div class="searchbox scan-search">${ICON.search.replace(/23/g, '17')}<input class="input" id="nameQ" type="search" placeholder="Or search for a name" autocomplete="off" autocapitalize="words" enterkeyhint="search" aria-label="Search for a name"></div>
      <div class="scan-results" id="nameResults" hidden></div>
      <div class="scan-actions" style="margin-top:8px"><label class="btn btn-light-ghost">${ICON.camera.replace(/22/g, '18')}Take photo<input type="file" accept="image/*" capture="environment" id="cap" hidden></label><label class="btn btn-light-ghost">Library<input type="file" accept="image/*" id="lib" hidden></label></div>`
    : `
      <div class="finder" id="finder"><video id="vid" playsinline muted></video><div class="reticle"></div><div class="finder-empty" id="qrIdle">${ICON.qr}<p>Point the camera at a plaque. The iPhone Camera app can also open these codes directly.</p></div></div>
      <div class="scan-actions"><button class="btn btn-light" id="startQR">Start camera</button><label class="btn btn-light-ghost">Scan from photo<input type="file" accept="image/*" id="qrfile" hidden></label></div>`}
    ${scanMode === 'qr' ? `<a class="scan-type" href="#/register">${ICON.search.replace(/23/g, '16')}Type a name instead</a>` : ''}
    <a class="scan-about" href="#/welcome">About Honor and Respect</a>
  </section><section id="ocr" class="pad"></section>`);
  $$('[data-mode]').forEach(b => b.onclick = () => { scanMode = b.dataset.mode; stopCamera(); viewScan(); });
  $('#cemChange').onclick = () => openCemPicker(() => { stopCamera(); viewScan(); });
  if (scanMode === 'stone') {
    ['#cap', '#lib'].forEach(s => $(s).onchange = e => { if (e.target.files[0]) { stopCamera(); handlePhoto(e.target.files[0]); } });
    $('#startLive').onclick = startLive;
    wireNameSearch();
  } else {
    $('#startQR').onclick = startQR;
    $('#qrfile').onchange = e => e.target.files[0] && qrFromFile(e.target.files[0]);
  }
}
// Search-as-you-type on the scan page, limited to the selected cemetery. "Frank Peregory" or "Peregory" both work.
function wireNameSearch() {
  const inp = $('#nameQ'), box = $('#nameResults');
  let t, seq = 0;
  const words = raw => raw.toUpperCase().replace(/[^A-Z\s'-]/g, ' ').replace(/['-]/g, '').split(/\s+/).filter(Boolean);
  const givenOk = (m, giv) => giv.every(g => [m.givenName, m.middleName].some(n => String(n || '').toUpperCase().startsWith(g)));
  const run = async () => {
    const raw = inp.value.trim(), my = ++seq, cem = cemName() || '';
    const w = words(raw);
    if (!w.length || w.join('').length < 2) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    if (!box.innerHTML) box.innerHTML = '<p class="sr-msg">Searching…</p>';
    try {
      let list, sur = w[w.length - 1];
      if (/^[A-Z]{2,4}-[\w.~-]+$/i.test(raw)) { const m = (await api.getMemorial(raw.toUpperCase())) || (await api.getMemorial(raw)); list = m && (!cem || m.cemetery === cem) ? [m] : []; }
      else if (w.length === 1) list = (await api.search({ q: sur, cemetery: cem, limit: 21 })).items;
      else {
        // Surname is usually last; if nothing fits, try it first ("Peregory Frank").
        list = (await api.search({ q: sur, cemetery: cem, limit: 200 })).items.filter(m => givenOk(m, w.slice(0, -1)));
        if (!list.length) { sur = w[0]; list = (await api.search({ q: sur, cemetery: cem, limit: 200 })).items.filter(m => givenOk(m, w.slice(1))); }
      }
      if (my !== seq) return;
      const more = list.length > 20;
      box.innerHTML = list.length
        ? list.slice(0, 20).map(rowHTML).join('') + (more ? `<a class="sr-more" id="srMore" href="#/register?q=${encodeURIComponent(sur)}">See all in the Register</a>` : '')
        : `<p class="sr-msg">No one named “${esc(raw)}” in ${esc(cem || 'the register')}.</p>`;
      if ($('#srMore')) $('#srMore').onclick = () => { reg.cemetery = cem; reg.limit = 50; };
    } catch (e) { if (my === seq) box.innerHTML = '<p class="sr-msg">Search failed. Try the Register tab.</p>'; console.warn(e); }
  };
  inp.oninput = () => { clearTimeout(t); t = setTimeout(run, 250); };
  inp.onfocus = () => setTimeout(() => inp.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300);
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); run(); inp.blur(); } };
}
function loadImg(file) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
// Stretch the darkest 2% to black and the lightest 2% to white. Helps carved letters with no dark fill.
function autoLevels(c) {
  const x = c.getContext('2d', { willReadFrequently: true }), d = x.getImageData(0, 0, c.width, c.height), p = d.data, h = new Uint32Array(256);
  for (let i = 0; i < p.length; i += 4) h[(p[i] * 77 + p[i + 1] * 150 + p[i + 2] * 29) >> 8]++;
  const n = p.length / 4; let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += h[lo]) < n * 0.02) lo++;
  acc = 0; while (hi > 0 && (acc += h[hi]) < n * 0.02) hi--;
  if (hi - lo < 10) return c;
  const k = 255 / (hi - lo);
  for (let i = 0; i < p.length; i += 4) { const v = Math.max(0, Math.min(255, ((p[i] * 77 + p[i + 1] * 150 + p[i + 2] * 29) >> 8) - lo) * k); p[i] = p[i + 1] = p[i + 2] = v; }
  x.putImageData(d, 0, 0);
  return c;
}
// Pass 1: as before (max 1800px, grayscale, contrast). Pass 2: enlarge small crops and auto-level.
function prepCanvas(img, r, strong) {
  const long = Math.max(r.w, r.h);
  const k = strong ? Math.min(3, Math.max(1, 1600 / long), 2400 / long) : Math.min(1, 1800 / long);
  const c = document.createElement('canvas'); c.width = Math.round(r.w * k); c.height = Math.round(r.h * k);
  const x = c.getContext('2d', { willReadFrequently: true }); x.filter = 'grayscale(1)' + (strong ? '' : ' contrast(1.4)');
  x.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  if (strong) { autoLevels(c); x.filter = 'contrast(1.3)'; x.drawImage(c, 0, 0); }
  return c;
}
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
let ocrWorker = null;
async function getWorker() { await loadScript(TESS); if (!ocrWorker) ocrWorker = await window.Tesseract.createWorker('eng'); return ocrWorker; }
// Live headstone scan: OCR on camera frames until the same record wins twice in a row.
async function startLive() {
  const btn = $('#startLive');
  const label = t => { btn.innerHTML = t; };
  btn.disabled = true; label('Starting camera…');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
  catch (e) { btn.disabled = false; label('Start live scan'); return toast('Camera unavailable. Use Take photo.'); }
  const v = $('#vid'); v.srcObject = stream; await v.play();
  $('#liveIdle').hidden = true; $('#liveMatch').hidden = true;
  let alive = true, timer;
  stopCamera = () => { alive = false; clearTimeout(timer); stream.getTracks().forEach(t => t.stop()); };
  const lt = $('#liveText'); lt.hidden = false; lt.innerHTML = '<span class="kicker light">Loading text recognition…</span>';
  label('Loading…');
  let worker;
  try { worker = await getWorker(); } catch (e) { stopCamera(); btn.disabled = false; label('Start live scan'); return toast('Text recognition failed to load'); }
  if (!alive) return;
  btn.disabled = false; label('Stop');
  btn.onclick = () => { stopCamera(); viewScan(); };
  lt.innerHTML = '<span class="kicker light">Hold steady…</span>';
  $('#finder').classList.add('live');
  const started = Date.now();
  let lastTop = null, streak = 0, reads = [], frame = 0;
  const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
  const restart = () => { viewScan(); $('#startLive').click(); };
  const loop = async () => {
    if (!alive) return;
    if (v.readyState >= 2 && v.videoWidth) {
      const vw = v.videoWidth, vh = v.videoHeight;
      const sx = vw * 0.12, sy = vh * 0.1, sw = vw * 0.76, sh = vh * 0.8;
      const k = Math.min(1, 1200 / sw);
      c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      x.filter = 'grayscale(1) contrast(1.5)';
      x.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
      if (++frame % 2 === 0) autoLevels(c);
      try {
        const { data } = await worker.recognize(c);
        if (!alive) return;
        const text = (data.text || '').trim();
        if (text) reads = [...reads, text].slice(-2);
        const combined = reads.join('\n');
        const lines = text.split('\n').map(s => s.trim()).filter(s => s.replace(/[^A-Za-z0-9]/g, '').length > 1).slice(0, 5);
        lt.innerHTML = `<span class="kicker light">Reading…</span>${lines.map(l => `<div class="ll">${esc(l)}</div>`).join('')}`;
        const top = rankCandidates(combined, scoped(await api.candidates(combined)), 3)[0];
        if (top && top.score >= 55) { streak = top.m.id === lastTop ? streak + 1 : 1; lastTop = top.m.id; } else { streak = 0; lastTop = null; }
        if (top && streak >= 2) return found(top, combined);
      } catch (e) { console.warn(e); }
    }
    if (Date.now() - started > 30000) {
      stopCamera(); $('#finder').classList.remove('live');
      lt.innerHTML = 'No confident match yet. Move closer, avoid glare, or take a photo instead.';
      label('Try again'); btn.onclick = restart;
      return;
    }
    timer = setTimeout(loop, 300);
  };
  const found = (top, text) => {
    const snap = document.createElement('canvas'); snap.width = v.videoWidth; snap.height = v.videoHeight; snap.getContext('2d').drawImage(v, 0, 0);
    stopCamera(); $('#finder').classList.remove('live');
    v.insertAdjacentHTML('afterend', `<img src="${snap.toDataURL('image/jpeg', 0.8)}" alt="">`);
    if (navigator.vibrate) navigator.vibrate(30);
    const mv = view(top.m);
    lt.hidden = true;
    const box = $('#liveMatch'); box.hidden = false;
    box.innerHTML = `<div class="kicker light">Match found · ${top.score}%</div><div class="lm-name">${esc(mv.name)}</div><div class="small">${esc(mv.rankLine)} · ${esc(mv.lifespan)}</div><div class="small" style="opacity:.8">${esc(top.m.location || '')}</div><div class="btnrow"><a class="btn btn-light" href="#/m/${encodeURIComponent(top.m.id)}">Open memorial</a><button class="btn btn-light-ghost" id="again">Keep scanning</button></div>`;
    $('#again').onclick = restart;
    label('Scan again'); btn.onclick = restart;
    showCandidates(text);
  };
  loop();
}
// Take photo / Library: let the person box the inscription, then read it (with a stronger second pass if needed).
async function handlePhoto(file) {
  let img;
  try { img = await loadImg(file); } catch (e) { return toast('Could not open that photo'); }
  const fin = $('#finder');
  fin.classList.add('cropping');
  fin.innerHTML = `<img src="${img.src}" alt="Captured headstone"><div class="crop-box" id="cropBox"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div>`;
  $('#ocr').innerHTML = '';
  $('#cropActions')?.remove();
  fin.insertAdjacentHTML('afterend', `<div id="cropActions"><p class="crop-hint">Drag the box over the name and dates. Leaving out grass and sky gives the best read.</p><div class="scan-actions" style="margin-top:8px"><button class="btn btn-light" id="readCrop">Read inscription</button><button class="btn btn-light-ghost" id="readAll">Use whole photo</button></div></div>`);
  // Displayed image area inside the finder (object-fit: contain).
  const area = () => { const W = fin.clientWidth, H = fin.clientHeight, k = Math.min(W / img.width, H / img.height); const w = img.width * k, h = img.height * k; return { x: (W - w) / 2, y: (H - h) / 2, w, h, k }; };
  const box = $('#cropBox');
  let b;
  const place = () => { box.style.left = b.x + 'px'; box.style.top = b.y + 'px'; box.style.width = b.w + 'px'; box.style.height = b.h + 'px'; };
  const reset = () => { const a = area(); b = { x: a.x + a.w * 0.08, y: a.y + a.h * 0.3, w: a.w * 0.84, h: a.h * 0.28 }; place(); };
  reset();
  const ro = new ResizeObserver(reset); ro.observe(fin);
  box.onpointerdown = e => {
    e.preventDefault(); box.setPointerCapture(e.pointerId);
    const h = e.target.dataset.h || '', sx = e.clientX, sy = e.clientY, s0 = { ...b }, a = area(), MIN = 36;
    box.onpointermove = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let { x, y, w, h: hh } = s0;
      if (!h) { x = Math.min(Math.max(a.x, x + dx), a.x + a.w - w); y = Math.min(Math.max(a.y, y + dy), a.y + a.h - hh); }
      else {
        if (h.includes('w')) { const nx = Math.min(Math.max(a.x, x + dx), x + w - MIN); w += x - nx; x = nx; }
        if (h.includes('e')) w = Math.min(Math.max(MIN, w + dx), a.x + a.w - x);
        if (h.includes('n')) { const ny = Math.min(Math.max(a.y, y + dy), y + hh - MIN); hh += y - ny; y = ny; }
        if (h.includes('s')) hh = Math.min(Math.max(MIN, hh + dy), a.y + a.h - y);
      }
      b = { x, y, w, h: hh }; place();
    };
    box.onpointerup = box.onpointercancel = () => { box.onpointermove = null; };
  };
  const go = whole => {
    ro.disconnect();
    const a = area();
    const r = whole ? { x: 0, y: 0, w: img.width, h: img.height } : { x: Math.round((b.x - a.x) / a.k), y: Math.round((b.y - a.y) / a.k), w: Math.round(b.w / a.k), h: Math.round(b.h / a.k) };
    r.x = Math.max(0, r.x); r.y = Math.max(0, r.y); r.w = Math.min(img.width - r.x, r.w); r.h = Math.min(img.height - r.y, r.h);
    fin.classList.remove('cropping');
    $('#cropActions')?.remove();
    fin.innerHTML = `<img src="${img.src}" alt="Captured headstone"><div class="scanbar"></div>`;
    readStone(img, r);
  };
  $('#readCrop').onclick = () => go(false);
  $('#readAll').onclick = () => go(true);
}
async function readStone(img, r) {
  const out = $('#ocr');
  const msg = t => { out.innerHTML = `<div class="kicker">Reading inscription</div><div class="progress indet"><div></div></div><p class="muted small">${t}</p>`; };
  msg('Loading text recognition…');
  const best = async text => { const top = rankCandidates(text, scoped(await api.candidates(text)), 1)[0]; return top ? top.score : 0; };
  try {
    const w = await getWorker();
    msg('Reading…');
    const t1 = (await w.recognize(prepCanvas(img, r, false))).data.text || '';
    let text = t1, score = await best(t1);
    if (score < 55) {
      msg('Trying again with stronger contrast…');
      const t2 = (await w.recognize(prepCanvas(img, r, true))).data.text || '';
      for (const t of [t2, t1 + '\n' + t2]) { const s2 = await best(t); if (s2 > score) { score = s2; text = t; } }
      if (!t1.trim()) text = t2;
    }
    $('.scanbar')?.remove();
    showCandidates(text);
  } catch (e) {
    console.warn(e);
    $('.scanbar')?.remove();
    showCandidates('');
    toast('Text recognition failed. Type the inscription instead.');
  }
}
function showCandidates(text) {
  const out = $('#ocr');
  out.innerHTML = `<div class="kicker">Read from stone</div>
    <textarea class="input ocr-text" id="ocrText" rows="4" placeholder="Type the inscription as it appears">${esc(text.trim())}</textarea>
    <p class="muted small">Correct any misread letters and the matches update.</p>
    <h3 style="margin-top:18px">Possible matches</h3><div id="cands"></div>
    <div class="none"><p class="muted small">None of these?</p><a class="btn btn-secondary btn-block" id="searchInstead" href="#/register">Search the register</a></div>`;
  let t; $('#ocrText').oninput = () => { clearTimeout(t); t = setTimeout(rerank, 250); };
  rerank();
}
async function rerank() {
  const text = $('#ocrText')?.value || '';
  const list = rankCandidates(text, scoped(await api.candidates(text)));
  const g = guessSurname(text);
  if ($('#searchInstead')) $('#searchInstead').href = '#/register' + (g ? '?q=' + encodeURIComponent(g) : '');
  $('#cands').innerHTML = list.length ? list.map((c, i) => {
    const v = view(c.m);
    return `<a class="card cand" href="#/m/${encodeURIComponent(c.m.id)}">
      <div class="ct"><span><span class="rk">${i + 1}</span><span class="card-title">${esc(v.name)}</span></span><span class="pc">${c.score}%</span></div>
      <div class="bar"><div style="width:${c.score}%"></div></div>
      <div class="small">${esc(v.rankLine)} · ${esc(v.lifespan)}</div>
      <div class="small muted">${esc(c.m.cemetery)} · ${esc(c.m.location)}</div>
      <div class="chips">${c.fields.map(([t, ok]) => `<span class="tag ${ok ? 'tag-accent' : 'tag-neutral'}">${ok ? '✓' : '×'} ${esc(t)}</span>`).join('')}</div></a>`;
  }).join('') : `<p class="muted">No confident match yet in ${esc(cemName() || 'the register')}. Try a sharper photo, or correct the text above.</p>`;
}
function handleQRText(text) {
  const m = String(text).match(/\/m\/([A-Za-z0-9._~-]+)/);
  const id = m ? m[1] : String(text).trim();
  if (!id) return toast('That code isn’t an Honor and Respect plaque');
  stopCamera();
  toast('Plaque recognized');
  location.hash = '#/m/' + encodeURIComponent(id);
}
async function startQR() {
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const v = $('#vid'); v.srcObject = stream; await v.play();
    $('#qrIdle').hidden = true; $('#startQR').textContent = 'Scanning…';
    const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
    let raf, alive = true;
    stopCamera = () => { alive = false; cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); };
    const tick = () => {
      if (!alive) return;
      if (v.readyState >= 2) {
        c.width = v.videoWidth; c.height = v.videoHeight; x.drawImage(v, 0, 0);
        const code = window.jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        if (code && code.data) return handleQRText(code.data);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) { toast('Camera unavailable. Use “Scan from photo”.'); }
}
async function qrFromFile(file) {
  await loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
  const c = await prepImage(file, 1400);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const code = window.jsQR(d.data, c.width, c.height);
  code ? handleQRText(code.data) : toast('No QR code found in that photo');
}

// ---------- register ----------
const FILTER_OPTS = {
  cemetery: Object.values(CEMETERIES).map(c => c.name),
  conflict: ['World War I', 'World War II', 'Korean War', 'Vietnam War', 'Cold War', 'Gulf War', 'Iraq & Afghanistan'],
  branch: ['U.S. Army', 'U.S. Navy', 'U.S. Marine Corps', 'U.S. Air Force', 'U.S. Coast Guard', 'U.S. Army Air Forces', 'U.S. Space Force'],
  status: Object.keys(STATUS)
};
const reg = { q: '', cemetery: '', conflict: '', branch: '', status: '', sort: 'surname', limit: 50 };
try { reg.cemetery = (CEMETERIES[localStorage.getItem('har-cemetery')] || {}).name || ''; } catch { }
function indexHelp(e, el) {
  console.error(e);
  const link = (String(e.message || '').match(/https:\/\/console\.firebase\.google\.com\S+/) || [])[0];
  el.innerHTML = `<div class="pad"><p class="muted">${link ? 'This filter combination needs a database index.' : 'Search failed: ' + esc(e.code || e.message)}</p>${link ? `<a class="btn btn-secondary" href="${esc(link)}" target="_blank" rel="noopener">Create the index in Firebase</a><p class="small muted">Admins: indexes take a few minutes to build. Deploying firestore.indexes.json creates them all at once.</p>` : ''}</div>`;
}
function viewRegister(params) {
  if (params.has('q')) reg.q = params.get('q');
  const opt = (k, v) => `<option value="${esc(v)}" ${reg[k] === v ? 'selected' : ''}>${esc(k === 'status' ? STATUS[v][0] : v)}</option>`;
  const sel = (k, label) => `<select class="input" data-f="${k}"><option value="">${label}: All</option>${k === 'cemetery' ? cemGroups().map(([g, names]) => `<optgroup label="${esc(g)}">${names.map(v => opt(k, v)).join('')}</optgroup>`).join('') : FILTER_OPTS[k].map(v => opt(k, v)).join('')}</select>`;
  set(`<div class="pad" style="padding-bottom:0">
      <h1 class="display" style="margin-top:12px">Register</h1>
      <div class="muted small">${esc(reg.cemetery || FILTER_OPTS.cemetery.length + ' cemeteries')}</div>
      <div class="searchbox">${ICON.search.replace(/23/g, '17')}<input class="input" id="q" type="search" value="${esc(reg.q)}" placeholder="Surname, or a memorial ID" autocomplete="off" autocapitalize="none"></div>
    </div>
    <div class="filters">${sel('cemetery', 'Cemetery')}${sel('conflict', 'Conflict')}${sel('branch', 'Branch')}${sel('status', 'Status')}</div>
    <div class="listhead"><span id="count"></span><button class="linkbtn" id="sort"></button></div>
    <div id="list" class="list"><p class="loading">Searching…</p></div>`);
  let seq = 0, t;
  const draw = async () => {
    const my = ++seq;
    $('#sort').textContent = 'Sort: ' + (reg.sort === 'surname' ? 'Surname' : 'Date of death');
    const q = reg.q.trim();
    try {
      let list;
      if (/^[A-Z]{2,4}-[\w.~-]+$/i.test(q)) { const m = (await api.getMemorial(q.toUpperCase())) || (await api.getMemorial(q)); list = m ? [m] : []; }
      else list = (await api.search({ ...reg, q, limit: reg.limit })).items;
      if (my !== seq) return;
      list = list.slice();
      if (reg.sort === 'death') list.sort((a, b) => (a.deathYear || 0) - (b.deathYear || 0));
      const more = list.length >= reg.limit;
      $('#count').textContent = `${list.length.toLocaleString()}${more ? '+' : ''} record${list.length === 1 ? '' : 's'}`;
      $('#list').innerHTML = list.length ? list.map(rowHTML).join('') + (more ? '<button class="btn btn-secondary btn-block more" id="more">Show more</button>' : '') : `<p class="loading">${q ? 'No surnames start with “' + esc(q) + '”.' : 'No records match.'}${!q && !reg.cemetery && !reg.conflict && !reg.branch && !reg.status && isAdmin() ? '<br><a href="#/admin/data">Records missing? Run Rebuild search keys.</a>' : ''}</p>`;
      if ($('#more')) $('#more').onclick = () => { reg.limit += 50; draw(); };
    } catch (e) { if (my === seq) indexHelp(e, $('#list')); }
  };
  $('#q').oninput = e => { reg.q = e.target.value; reg.limit = 50; clearTimeout(t); t = setTimeout(draw, 300); };
  $$('[data-f]').forEach(s => s.onchange = () => { reg[s.dataset.f] = s.value; reg.limit = 50; draw(); });
  $('#sort').onclick = () => { reg.sort = reg.sort === 'surname' ? 'death' : 'surname'; draw(); };
  draw();
}

// ---------- memorial (layout 2a) ----------
async function viewMemorial(id) {
  loading();
  const m = await api.getMemorial(id);
  if (!m) return set(`${'<header class="topbar">' + backBtn() + '</header>'}<div class="pad"><h2>No memorial found</h2><p class="muted">There is no register entry with the ID <strong>${esc(id)}</strong>.</p><a class="btn btn-primary" href="#/register">Search the register</a></div>`);
  const v = view(m);
  const saved = !!store.get('har-saved')[id];
  const info = [['Born', [m.birthDate, m.birthplace].filter(Boolean).join(' · ') || 'Unknown'], ['Died', m.deathDate], ['Interred', m.intermentDate], ['Relationship', /^(veteran|self)$/i.test(m.relationship || '') ? '' : m.relationship], ['Service no.', m.serviceNumber], ['Unit', m.unit], ['Conflict', m.conflict], ['Entered from', m.enteredFrom], ['Burial', m.location]].filter(r => r[1]);
  const bio = String(m.biography || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const media = (m.mediaUrls || []).filter(Boolean);
  const sources = [m.officialCitation, ...(m.sources || [])].filter(Boolean);
  const rec = m.record || {};
  const recTag = { linked: ['Linked', 'tag-accent'], possible: ['Possible match', 'tag-outline'], none: ['No record', 'tag-neutral'] }[rec.status || 'none'] || ['No record', 'tag-neutral'];
  const editLabel = isEditor() ? 'Edit' : 'Suggest edit';
  const enc = encodeURIComponent(id);
  set(`<header class="topbar">${backBtn()}<div class="tb">
      ${isAdmin() ? `<button class="iconbtn" id="qrBtn" title="Print QR plaque">${ICON.qr}</button>` : ''}
      <a class="iconbtn" href="#/m/${enc}/history" title="Revision history">${ICON.history}</a>
      <button class="iconbtn ${saved ? 'on' : ''}" id="saveBtn" title="Save">${ICON.bookmark}</button></div></header>
    <article class="pad mem">
      <div class="kicker">${esc(m.cemetery)} · ${esc((m.location || '').replace(/ · /g, ', '))}</div>
      <h1 class="display">${esc(v.name)}</h1>
      <div class="sub">${esc(v.rankLine)}${v.lifespan ? ' · ' + esc(v.lifespan) : ''}</div>
      <div class="meta"><span class="tag ${v.statusClass}">${v.statusLabel}</span>${m.updatedAt ? `<span>Updated ${fmtDate(m.updatedAt.toMillis ? m.updatedAt.toMillis() : m.updatedAt)}</span>` : ''}</div>
      ${m.photoUrl ? `<figure style="margin-top:20px"><img class="plate" src="${esc(m.photoUrl)}" alt="Headstone of ${esc(v.name)}" style="width:100%"><figcaption>Headstone photograph.</figcaption></figure>`
      : `<div class="stone-wrap">${stoneHTML(inscriptionOf(m))}<div class="small muted" style="margin-top:10px;padding:0 16px">Composite from the register transcription. No photograph yet.</div><a class="btn btn-ghost" href="#/m/${enc}/edit" style="margin-top:2px">+ Add a photograph</a></div>`}
      <div class="info">${info.map(([k, val]) => `<div><span class="k">${k}</span><span>${esc(val)}</span></div>`).join('')}</div>
      <h4 class="sec">Biography</h4>
      ${bio.length ? `<div class="bio">${bio.map(p => `<p>${esc(p)}</p>`).join('')}</div>` : `<div class="empty">No biography has been written yet.<a class="btn btn-ghost" href="#/m/${enc}/edit">Write the first entry</a></div>`}
      <h4 class="sec">Service record</h4>
      <a class="card reclink" href="#/m/${enc}/records"><div><div class="card-kicker" style="color:var(--color-accent-700)">${esc(rec.source || 'Public records')}</div><div class="card-title">${rec.externalId ? 'Record ' + esc(rec.externalId) : 'Search public records'}</div><div><span class="tag ${recTag[1]}">${recTag[0]}</span></div></div>${ICON.chev}</a>
      <h4 class="sec" style="margin-bottom:6px">Awards &amp; decorations</h4>
      ${(m.awards || []).length ? m.awards.map(a => `<div class="award">${esc(a)}</div>`).join('') : '<div class="muted small">None recorded.</div>'}
      <div style="margin-top:22px;border-top:1px solid var(--color-divider)">
        <details class="acc"><summary>Contributed media<span>${media.length}${ICON.down}</span></summary><div class="media">${media.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt=""></a>`).join('')}<a class="add" href="#/m/${enc}/edit">+ Add</a></div></details>
        <details class="acc"><summary>Sources<span>${sources.length}${ICON.down}</span></summary><ol class="sources">${sources.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>
      </div>
      <section class="remb" id="remb" aria-labelledby="rembH"><h4 class="sec" id="rembH">Remembrances &amp; stories</h4><div id="rembList" class="muted small">Loading…</div></section>
    </article>
    <nav class="circles">
      <a class="circle accent" href="#/m/${enc}/edit"><span>${ICON.pencil}</span>${editLabel}</a>
      <a class="circle" href="#/m/${enc}/records"><span>${ICON.link}</span>Records</a>
      <a class="circle" href="#/m/${enc}/location"><span>${ICON.pin}</span>Location</a>
    </nav>`);
  $('#saveBtn').onclick = () => { const s = store.get('har-saved'); s[id] ? delete s[id] : (s[id] = Date.now()); store.set('har-saved', s); $('#saveBtn').classList.toggle('on', !!s[id]); toast(s[id] ? 'Saved' : 'Removed from saved'); };
  if ($('#qrBtn')) $('#qrBtn').onclick = () => openPrint([m]);
  remembranceSection(m, v);
}

// ---------- remembrances & stories ----------
const RELATIONSHIPS = ['Family member', 'Friend', 'Served together', 'Descendant', 'Visitor', 'Other'];
const REMB_STATUS = { published: ['Published', 'tag-neutral'], pending: ['Awaiting review', 'tag-accent'], unconfirmed: ['Email not confirmed yet', 'tag-outline'], hidden: ['Hidden', 'tag-outline'] };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function rembHTML(r, mod) {
  const st = REMB_STATUS[r.status] || REMB_STATUS.published;
  const actions = mod ? `<div class="btnrow remb-mod">${r.status !== 'published' ? `<button class="btn btn-secondary" data-rpub="${esc(r.id)}">${r.status === 'pending' ? 'Approve' : r.status === 'unconfirmed' ? 'Publish anyway' : 'Show again'}</button>` : `<button class="btn btn-secondary" data-rhide="${esc(r.id)}">Hide</button>`}${isAdmin() ? `<button class="btn btn-secondary" data-rdel="${esc(r.id)}">Delete</button>` : ''}</div>` : '';
  return `<article class="remb-item ${r.status !== 'published' ? 'is-' + esc(r.status) : ''}">
    <div class="ct"><span class="remb-name">${esc(r.name)}${r.relationship ? ` <em class="small muted">${esc(r.relationship)}</em>` : ''}</span><span class="small muted">${fmtDate(r.createdAt)}</span></div>
    <div class="remb-body">${esc(r.body)}</div>
    ${mod && r.status !== 'published' ? `<div class="chips"><span class="tag sm ${st[1]}">${st[0]}</span></div>` : ''}${actions}</article>`;
}
function bindRembModeration(list, after) {
  $$('[data-rpub],[data-rhide],[data-rdel]').forEach(b => b.onclick = async () => {
    const id = b.dataset.rpub || b.dataset.rhide || b.dataset.rdel;
    try {
      const r = list.find(x => x.id === id);
      if (b.dataset.rdel) { if (!confirm('Delete this remembrance permanently? This cannot be undone.')) return; await api.deleteRemembrance(id, r); toast('Remembrance deleted'); }
      else { await api.moderateRemembrance(id, b.dataset.rpub ? 'published' : 'hidden', user, r); toast(b.dataset.rpub ? 'Remembrance published' : 'Remembrance hidden'); }
      after();
    } catch (e) { toast('Update failed: ' + (e.code || e.message)); }
  });
}
async function viewConfirm(id, token) {
  set('<div class="pad"><div class="kicker">Remembrances &amp; stories</div><h1 class="display" style="font-size:30px">Confirming your remembrance…</h1></div>');
  try {
    const r = await api.confirmRemembrance(id, token);
    const enc = encodeURIComponent(r.memorialId);
    set(`<div class="pad"><div class="kicker">Remembrances &amp; stories</div><h1 class="display" style="font-size:30px">${r.status === 'published' ? 'Thank you. Your remembrance is published.' : r.status === 'pending' ? 'Thank you. Your email is confirmed.' : 'This remembrance was already handled.'}</h1>
      <p class="muted">${r.status === 'published' ? 'It now appears on the memorial for everyone to read.' : r.status === 'pending' ? 'A moderator will review your remembrance shortly, and it will appear on the memorial once approved.' : 'There is nothing more you need to do.'}</p>
      <a class="btn btn-primary" href="#/m/${enc}">View the memorial</a></div>`);
  } catch (e) {
    console.error(e);
    set(`<div class="pad"><div class="kicker">Remembrances &amp; stories</div><h1 class="display" style="font-size:30px">We couldn't confirm this remembrance</h1><p class="muted">${esc(e.message || 'Please try the link again.')}</p><a class="btn btn-secondary" href="#/register">Search the register</a></div>`);
  }
}
async function remembranceSection(m, v) {
  const box = $('#remb'); if (!box) return;
  const mod = isEditor();
  const draw = async (note) => {
    let list = [];
    try { list = await api.remembrances(m.id, mod); } catch (e) { console.error(e); }
    if (!$('#rembList')) return;
    const shown = list.filter(r => r.status === 'published').length;
    $('#rembList').className = 'remb-list';
    $('#rembList').innerHTML = (note ? `<div class="remb-note" role="status">${note}</div>` : '')
      + (list.length ? list.map(r => rembHTML(r, mod)).join('') : `<p class="muted small" style="margin:4px 0 0">No remembrances yet. Be the first to share a memory of ${esc(v.name)}.</p>`)
      + (mod && list.length > shown ? `<p class="small muted">${list.length - shown} not shown publicly. <a href="#/admin/remembrances">Open the remembrances queue</a></p>` : '');
    bindRembModeration(list, () => draw());
  };
  box.insertAdjacentHTML('beforeend', `<details class="remb-form-wrap" id="rembWrap"><summary class="btn btn-primary btn-block">Leave a remembrance or story</summary>
    <form class="remb-form" id="rembForm" novalidate>
      <p class="small muted" style="margin:0">Share a memory, a family story or a tribute to ${esc(v.name)}. Your name appears with your post.</p>
      <div class="field"><label for="rbName">Your name</label><input class="input" id="rbName" name="name" maxlength="80" required autocomplete="name" value="${esc(user && user.name && !String(user.name).includes('@') ? user.name : '')}"></div>
      <div class="field"><label for="rbEmail">Email</label><input class="input" id="rbEmail" name="email" type="email" maxlength="254" required autocomplete="email" value="${esc(user && user.email && !String(user.email).endsWith('@' + USERNAME_DOMAIN) ? user.email : '')}"><span class="small muted">Required, but never shown publicly. Only site moderators can see it.</span></div>
      <div class="field"><label for="rbRel">Relationship <span class="muted">(optional)</span></label><select class="input" id="rbRel" name="relationship"><option value="">Choose…</option>${RELATIONSHIPS.map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
      <div class="field"><label for="rbBody">Remembrance or story</label><textarea class="input" id="rbBody" name="body" rows="6" maxlength="3000" required></textarea><span class="small muted" id="rbCount">0 / 3000</span></div>
      <div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="small muted" style="margin:0"><span id="rbHow">${isEditor() ? 'You are signed in as a moderator, so your post appears straight away.' : ''}</span> Please keep posts respectful. Moderators may remove anything inappropriate.</p>
      <div class="btnrow"><button class="btn btn-primary" type="submit">Post remembrance</button></div>
    </form></details>`);
  const form = $('#rembForm'), opened = { t: 0 };
  if (!isEditor()) api.remembranceSettings().then(c => { if ($('#rbHow')) $('#rbHow').textContent = c.requireEmailConfirmation ? 'We will email you a link to confirm your post before it appears.' : c.requireApproval ? 'A moderator reviews each post before it appears.' : ''; }).catch(() => { });
  $('#rembWrap').ontoggle = () => { if ($('#rembWrap').open && !opened.t) { opened.t = Date.now(); $('#rbName').value ? $('#rbBody').focus() : $('#rbName').focus(); } };
  $('#rbBody').oninput = e => { $('#rbCount').textContent = e.target.value.length + ' / 3000'; };
  form.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim().replace(/\s+/g, ' ');
    const email = String(fd.get('email') || '').trim();
    const relationship = String(fd.get('relationship') || '');
    const body = String(fd.get('body') || '').trim().replace(/\n{3,}/g, '\n\n');
    if (fd.get('website')) return; // honeypot: bots fill every field
    if (!name) return toast('Please enter your name');
    if (!EMAIL_RE.test(email)) return toast('Please enter a valid email address');
    if (body.length < 2) return toast('Please write your remembrance');
    if ((body.match(/https?:\/\/|www\./gi) || []).length > 2) return toast('Please include no more than two links');
    if (opened.t && Date.now() - opened.t < 3000) return toast('Please take a moment before posting');
    const recent = (store.get('har-remb-posts').t || []).filter(t => Date.now() - t < 10 * 60e3);
    if (recent.length >= 3) return toast('You have posted several remembrances. Please try again in a few minutes.');
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const res = await api.addRemembrance(m.id, { name, relationship, body, email }, user);
      store.set('har-remb-posts', { t: recent.concat(Date.now()) });
      form.reset(); $('#rbCount').textContent = '0 / 3000'; $('#rembWrap').open = false; opened.t = 0;
      await draw(res.status === 'published' ? 'Thank you. Your remembrance has been posted.'
        : res.status === 'pending' ? 'Thank you. Your remembrance will appear here once a moderator has reviewed it.'
        : `Thank you. We've sent a confirmation link to <strong>${esc(email)}</strong>. Your remembrance will appear here once you open it. If you don't see the email in a few minutes, check your spam folder.`
          + (res.demoToken ? `<br><a href="#/confirm/${encodeURIComponent(res.id)}/${encodeURIComponent(res.demoToken)}">Demo mode: no email is sent. Open the confirmation link</a>` : ''));
      $('#remb').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { console.error(err); toast('Could not post: ' + (err.code === 'permission-denied' ? 'please check your entries and try again' : (err.code || err.message))); }
    btn.disabled = false;
  };
  draw();
}

// ---------- records ----------
async function viewRecords(id) {
  loading();
  const m = await api.getMemorial(id); if (!m) return viewMemorial(id);
  const v = view(m), rec = m.record || {};
  const status = { linked: ['Linked', 'tag-accent'], possible: ['Possible match', 'tag-outline'], none: ['Not linked', 'tag-neutral'] }[rec.status || 'none'] || ['Not linked', 'tag-neutral'];
  const compare = [['Name', v.name], ['Service number', m.serviceNumber], ['Entered from', m.enteredFrom], ['Born', m.birthDate], ['Died', m.deathDate], ['Unit', m.unit]].filter(r => r[1]);
  const srcs = [
    ['ANC Explorer', 'Arlington interments: names, dates, section and site.', 'https://ancexplorer.army.mil/'],
    ['ABMC burial search', 'Overseas cemeteries including Normandy: unit, service no., plot, awards.', 'https://www.abmc.gov/'],
    ['NARA Access to Archival Databases', 'WWII Army Enlistment Records and more.', 'https://aad.archives.gov/aad/'],
    ['NPRC personnel records (OMPF)', 'Archival files are open to the public 62 years after separation.', 'https://www.archives.gov/personnel-records-center'],
    ['VA Nationwide Gravesite Locator', 'Cross-check national cemetery burials.', 'https://gravelocator.cem.va.gov/']
  ];
  set(`<header class="topbar">${backBtn('Memorial')}</header><div class="pad">
    <div class="kicker">Public records</div><h1 class="display" style="font-size:32px">Service record</h1>
    <div class="muted small">${esc(v.name)} · ${esc(v.rankLine)}</div>
    <div class="card" style="margin-top:18px;gap:10px">
      <div class="ct"><div><div class="card-kicker" style="color:var(--color-accent-700)">${esc(rec.source || 'No linked source')}</div><div class="card-title">${rec.externalId ? 'Record ' + esc(rec.externalId) : 'No record linked yet'}</div></div><span class="tag ${status[1]}">${status[0]}</span></div>
      <div class="info" style="margin-top:4px">${compare.map(([k, val]) => `<div><span class="k">${k}</span><span>${esc(val)}</span></div>`).join('')}</div>
      <div class="small muted">Compare these register fields with the public record before linking.</div>
      <div class="btnrow">${rec.url ? `<a class="btn btn-secondary" href="${esc(rec.url)}" target="_blank" rel="noopener">Open source</a>` : ''}<a class="btn btn-primary" href="#/m/${encodeURIComponent(id)}/edit#record">${isEditor() ? 'Edit record link' : 'Suggest a record link'}</a></div>
    </div>
    <h4 class="sec" style="font-size:21px">Search other sources</h4>
    ${srcs.map(([t, d, u]) => `<a class="srcrow" href="${u}" target="_blank" rel="noopener"><div><div>${t}</div><div class="small muted">${d}</div></div>${ICON.chev}</a>`).join('')}
  </div>`);
}

// ---------- location ----------
async function viewLocation(id) {
  loading();
  const m = await api.getMemorial(id); if (!m) return viewMemorial(id);
  const v = view(m), c = CEMETERIES[m.cemeteryKey];
  const visited = !!store.get('har-visited')[id];
  const g = m.geo || (c && c.geo ? { lat: c.geo[0], lng: c.geo[1] } : null);
  set(`<header class="topbar">${backBtn('Memorial')}</header><div class="pad">
    <div class="kicker">Grave location</div><h1 class="display" style="font-size:30px">${esc(m.cemetery)}</h1>
    ${c && c.plots ? `<div class="plan"><div class="plan-top">${esc(c.top)}</div><div class="plots">${c.plots.map(p => `<div class="${String(p) === String(m.section) ? 'on' : ''}">${p}</div>`).join('')}</div><div class="plan-you"><i></i>You are here · ${esc(c.gate)}</div></div>` : ''}
    <div class="card" style="margin-top:14px;gap:6px"><div class="card-title" style="font-size:20px">${esc(v.name)}</div><div class="small">${esc(m.location)}</div>
      <div class="btnrow">${g ? `<a class="btn btn-primary" href="https://maps.apple.com/?daddr=${g.lat},${g.lng}&dirflg=w" target="_blank" rel="noopener">Walking directions</a>` : ''}<button class="btn btn-secondary" id="visit">${visited ? 'Visited ✓' : 'Mark visited'}</button></div></div>
    <p class="small muted" style="margin-top:12px">Plot plan is schematic. Directions use the grave’s stored coordinates.</p>
  </div>`);
  $('#visit').onclick = () => { const s = store.get('har-visited'); s[id] ? delete s[id] : (s[id] = Date.now()); store.set('har-visited', s); $('#visit').textContent = s[id] ? 'Visited ✓' : 'Mark visited'; toast(s[id] ? 'Marked as visited' : 'Visit removed'); };
}

// ---------- edit ----------
const FIELDS = [
  ['givenName', 'Given name'], ['middleName', 'Middle name'], ['surname', 'Surname'], ['fullName', 'Display name'],
  ['rank', 'Rank'], ['rankAbbr', 'Rank abbreviation'], ['branch', 'Branch'], ['unit', 'Unit'], ['serviceNumber', 'Service number'],
  ['birthDate', 'Born'], ['birthYear', 'Birth year', 'number'], ['deathDate', 'Died'], ['deathYear', 'Death year', 'number'],
  ['birthplace', 'Birthplace'], ['enteredFrom', 'Entered service from'], ['conflict', 'Conflict'],
  ['photoUrl', 'Headstone photo URL', 'url'], ['biography', 'Biography', 'textarea'], ['sources', 'Sources (one per line)', 'lines'],
  ['awards', 'Awards (one per line)', 'lines'], ['inscription', 'Inscription (one line per row)', 'lines'], ['mediaUrls', 'Contributed media URLs (one per line)', 'lines'],
  ['cemetery', 'Cemetery'], ['cemeteryKey', 'Cemetery key (e.g. normandy, arlington; see js/cemeteries.js)'], ['location', 'Burial location (display)'], ['section', 'Section or plot'], ['row', 'Row'], ['site', 'Site or grave'],
  ['geo.lat', 'Latitude', 'number'], ['geo.lng', 'Longitude', 'number'],
  ['record.source', 'Record source'], ['record.externalId', 'Record ID'], ['record.url', 'Record URL', 'url'], ['record.status', 'Record status', 'select:linked,possible,none'],
  ['status', 'Register status', 'select:verified,needs_review,unmatched']
];
const MAIN = ['givenName', 'middleName', 'surname', 'rank', 'unit', 'birthDate', 'deathDate', 'birthplace', 'photoUrl', 'biography', 'sources'];
const getP = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
function setP(o, k, v) { const ps = k.split('.'); let t = o; ps.slice(0, -1).forEach(p => { t[p] = t[p] && typeof t[p] === 'object' ? { ...t[p] } : {}; t = t[p]; }); t[ps[ps.length - 1]] = v; }
function fieldHTML([k, label, type = 'text'], m) {
  const raw = getP(m, k);
  const val = type === 'lines' ? (raw || []).join('\n') : (raw ?? '');
  const n = `name="${k}"`;
  if (type === 'textarea') return `<div class="field"><label>${label}</label><textarea class="input" ${n} rows="8">${esc(val)}</textarea></div>`;
  if (type === 'lines') return `<div class="field"><label>${label}</label><textarea class="input" ${n} rows="4">${esc(val)}</textarea></div>`;
  if (type.startsWith('select:')) return `<div class="field"><label>${label}</label><select class="input" ${n}>${type.slice(7).split(',').map(o => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
  return `<div class="field"><label>${label}</label><input class="input" ${n} type="${type === 'number' ? 'text' : type}" ${type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(val)}"></div>`;
}
async function viewEdit(id) {
  if (role() === 'reader') return needAuth('Sign in to suggest edits');
  const isNew = !id;
  if (isNew && !isEditor()) return needAuth('Editors only');
  loading();
  const m = isNew ? { status: 'needs_review', record: { status: 'none' } } : await api.getMemorial(id);
  if (!m) return viewMemorial(id);
  const direct = isEditor();
  const main = FIELDS.filter(f => MAIN.includes(f[0])), more = FIELDS.filter(f => !MAIN.includes(f[0]));
  set(`<form id="ef"><header class="topbar three"><button type="button" class="back" data-back>Cancel</button><div class="tb-title">${isNew ? 'New memorial' : direct ? 'Edit memorial' : 'Suggest an edit'}</div><button class="btn btn-primary" type="submit" style="margin-right:8px">${direct ? 'Publish' : 'Submit'}</button></header>
    <div class="pad form">
      <div class="note"><div class="kicker">${direct ? 'Direct edit' : 'Suggestion'}</div>${direct ? 'Your changes publish immediately and are kept in the revision history.' : 'An editor reviews your changes before they appear on the memorial.'}</div>
      ${isNew ? `<div class="field"><label>Memorial ID (used in the QR code URL)</label><input class="input" name="__id" required pattern="[A-Za-z0-9._~-]+" placeholder="e.g. ANC-60-1234"></div>` : ''}
      ${main.map(f => fieldHTML(f, m)).join('')}
      <details class="acc" id="record"><summary>More fields: burial, record link, status<span>${ICON.down}</span></summary><div class="form" style="padding:10px 0 16px">${more.map(f => fieldHTML(f, m)).join('')}</div></details>
      <div class="field"><label>Summary of changes (required)</label><input class="input" name="__summary" placeholder="What changed, and on what evidence?"><div class="err" id="err" hidden>Add a short summary so reviewers know what changed.</div></div>
      <div class="small muted">Saves to memorials/${esc(id || '…')} and logs a revision.</div>
    </div></form>`);
  if (location.hash.includes('edit#record')) $('#record').open = true;
  $('#ef').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const summary = String(fd.get('__summary') || '').trim();
    if (!summary) { $('#err').hidden = false; return; }
    const next = JSON.parse(JSON.stringify(m)), changes = {};
    FIELDS.forEach(([k, , type = 'text']) => {
      let v = fd.get(k); if (v == null) return; v = String(v);
      let val = type === 'lines' ? v.split('\n').map(s => s.trim()).filter(Boolean) : type === 'number' ? (v.trim() === '' ? null : Number(v)) : v.trim();
      if (JSON.stringify(getP(m, k) ?? (type === 'lines' ? [] : type === 'number' ? null : '')) !== JSON.stringify(val)) { setP(next, k, val); const top = k.split('.')[0]; changes[top] = getP(next, top); }
    });
    if (!isNew && !Object.keys(changes).length) return toast('No changes to save');
    const newId = isNew ? String(fd.get('__id')).trim() : id;
    try {
      if (isNew && (await api.getMemorial(newId))) return toast('That ID already exists');
      if (direct) await api.saveMemorial(newId, isNew ? next : changes, summary, user);
      else await api.suggest(newId, changes, summary, user);
      toast(direct ? 'Published' : 'Suggestion sent for review');
      location.replace('#/m/' + encodeURIComponent(newId));
    } catch (err) { console.error(err); toast('Save failed: ' + (err.code || err.message)); }
  };
}

// ---------- history ----------
function revHTML(r, withName = '') {
  const initials = (r.authorName || '?').split(/[\s.@]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const st = { published: ['Published', 'tag-neutral'], pending: ['Pending review', 'tag-accent'], rejected: ['Rejected', 'tag-neutral'] }[r.status] || ['', ''];
  const fields = Object.keys(r.changes || {});
  return `<div class="rev"><div class="avatar">${esc(initials)}</div><div>
    <div class="ct"><span>${esc(r.authorName || 'Unknown')} <em class="small muted">${esc(r.authorRole || '')}</em></span><span class="small muted">${fmtDate(r.createdAt)}</span></div>
    ${withName}<div style="font-size:13.5px;line-height:1.45">${esc(r.summary)}</div>
    <div class="chips"><span class="tag sm ${st[1]}">${st[0]}</span>${fields.length ? `<span class="small muted">${esc(fields.join(', '))}</span>` : ''}</div>
    ${r.status === 'pending' && isEditor() ? `<div class="btnrow"><button class="btn btn-primary" data-approve="${esc(r.id)}">Approve</button><button class="btn btn-secondary" data-reject="${esc(r.id)}">Reject</button></div>` : ''}
  </div></div>`;
}
function bindReview(list, after) {
  $$('[data-approve],[data-reject]').forEach(b => b.onclick = async () => {
    const r = list.find(x => x.id === (b.dataset.approve || b.dataset.reject));
    try { await api.review(r, !!b.dataset.approve, user); toast(b.dataset.approve ? 'Approved and published' : 'Suggestion rejected'); after(); } catch (e) { toast('Review failed: ' + (e.code || e.message)); }
  });
}
async function viewHistory(id) {
  loading();
  const [m, list] = await Promise.all([api.getMemorial(id), api.revisions(id)]);
  set(`<header class="topbar">${backBtn()}</header><div class="pad"><h1 class="display" style="font-size:32px">Revision history</h1><div class="muted small">${esc(m ? view(m).name : id)}</div>
    <div class="revs">${list.length ? list.map(r => revHTML(r)).join('') : '<p class="muted" style="padding:14px 0">No revisions yet.</p>'}</div></div>`);
  bindReview(list, () => viewHistory(id));
}

// ---------- saved ----------
async function viewSaved(params) {
  const tab = params.get('t') || 'saved';
  loading();
  const map = store.get(tab === 'saved' ? 'har-saved' : 'har-visited');
  const list = await api.getMany(Object.keys(map).sort((a, b) => map[b] - map[a]));
  set(`<div class="pad" style="padding-bottom:0"><h1 class="display" style="margin-top:12px">Saved</h1>
    <div class="subtabs"><a href="#/saved?t=saved" class="${tab === 'saved' ? 'on' : ''}">Saved</a><a href="#/saved?t=visited" class="${tab === 'visited' ? 'on' : ''}">Visited</a></div></div>
    <div class="list">${list.length ? list.map(rowHTML).join('') : `<p class="loading">${tab === 'saved' ? 'Tap the bookmark on any memorial to keep it here.' : 'Graves you mark as visited appear here.'}</p>`}</div>
    <p class="small muted pad">Saved and visited lists are kept on this device.</p>`);
}

// ---------- account ----------
function roleLadder() {
  const ri = ROLES.findIndex(r => r[0] === role());
  return `<div class="info">${ROLES.map(([, n, d], i) => `<div class="ladder ${i === ri ? 'cur' : ''}"><span class="dot ${i <= ri ? 'reach' : ''}"></span><span><span class="ln2">${n}${i === ri ? ' (you)' : ''}</span><span class="small muted">${d}</span></span></div>`).join('')}</div>`;
}
async function viewAccount() {
  if (!user) {
    set(`<div class="pad form" style="padding-top:48px">
      <div class="kicker">Honor and Respect</div><h1 class="display">Sign in to contribute</h1>
      <p class="bio-p">Anyone can scan, search and read memorials. With an account you can suggest corrections, add photographs and link public records.</p>
      <form id="sf" class="form"><div class="field"><label>Email or username</label><input class="input" name="email" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      <div class="field"><label>Password</label><input class="input" name="password" type="password" autocomplete="current-password" ${api.demo ? '' : 'required minlength="6"'}></div>
      <div class="field" id="nameField" hidden><label>Display name</label><input class="input" name="name" autocomplete="name"></div>
      <button class="btn btn-primary btn-block big" type="submit" id="sBtn">Sign in</button></form>
      ${!api.demo && ENABLE_GOOGLE_SIGNIN ? '<button class="btn btn-secondary btn-block big" id="google" style="margin-top:0">Continue with Google</button>' : ''}
      <div class="btnrow center"><button class="linkbtn" id="toggle">Create an account</button>${api.demo ? '' : '<button class="linkbtn" id="reset">Forgot password?</button>'}</div>
      <div class="small muted center">New accounts start as Contributor.</div><a class="btn btn-secondary btn-block big" href="guide.html" style="margin-top:6px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>Read the user guide</a></div>`);
    let creating = false;
    $('#toggle').onclick = () => { creating = !creating; $('#nameField').hidden = !creating; $('#sBtn').textContent = creating ? 'Create account' : 'Sign in'; $('#toggle').textContent = creating ? 'I already have an account' : 'Create an account'; };
    $('#sf').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      try {
        const email = toEmail(fd.get('email'));
        if (api.demo) { user = api.signIn(email, fd.get('name'), email === OWNER_EMAIL ? 'admin' : null); afterAuth(); return; }
        const { au, auth } = api;
        if (creating) { const c = await au.createUserWithEmailAndPassword(auth, email, fd.get('password')); if (fd.get('name')) await au.updateProfile(c.user, { displayName: fd.get('name') }); }
        else await au.signInWithEmailAndPassword(auth, email, fd.get('password'));
      } catch (err) { toast(authMsg(err)); }
    };
    if ($('#google')) $('#google').onclick = async () => { try { await api.au.signInWithPopup(api.auth, new api.au.GoogleAuthProvider()); } catch (err) { toast(authMsg(err)); } };
    if ($('#reset')) $('#reset').onclick = async () => { const em = $('[name=email]').value; if (!em) return toast('Enter your email first'); try { await api.au.sendPasswordResetEmail(api.auth, toEmail(em)); toast('Reset email sent'); } catch (err) { toast(authMsg(err)); } };
    return;
  }
  const ri = ROLES.find(r => r[0] === role());
  const req = user.profile?.requestedRole || user.requestedRole;
  set(`<div class="pad" style="padding-top:40px">
    <div class="who"><div class="avatar lg">${esc((user.name || user.email || '?').slice(0, 2).toUpperCase())}</div><div><div class="card-title" style="font-size:22px">${esc(user.name || '')}</div><div class="small muted">${esc(user.email || '')}</div></div></div>
    <div class="chips" style="margin-top:12px"><span class="tag tag-accent">${ri ? ri[1] : role()}</span></div>
    ${api.demo ? `<div class="card" style="margin-top:18px;gap:8px"><div class="card-kicker" style="color:var(--color-accent-700)">Demo mode</div><div class="small">Choose a role to test permissions. In live mode an admin assigns roles.</div><select class="input" id="demoRole">${ROLES.slice(1).map(([k, n]) => `<option value="${k}" ${k === role() ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="linkbtn" id="resetDemo" style="align-self:flex-start">Reset sample data on this device</button></div>` : ''}
    <h4 class="sec" style="font-size:21px;margin-bottom:4px">Permissions</h4>${roleLadder()}
    ${role() === 'contributor' ? (req ? `<div class="note" style="margin-top:16px"><div class="kicker">Pending</div>Your editor request was sent to the administrators.</div>`
      : `<details class="acc" style="margin-top:12px"><summary>Request editor access<span>${ICON.down}</span></summary><form id="rq" class="form" style="padding:8px 0 16px"><div class="field"><label>Affiliation</label><input class="input" name="affiliation" placeholder="e.g. Genealogical society, unit association"></div><div class="field"><label>Why do you need direct editing?</label><textarea class="input" name="reason" rows="3"></textarea></div><button class="btn btn-primary" type="submit">Submit request</button></form></details>`) : ''}
    <a class="btn btn-secondary btn-block big" href="guide.html" style="margin-top:22px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>Read the user guide</a><button class="btn btn-ghost" id="out" style="margin-top:10px">Sign out</button></div>`);
  if ($('#demoRole')) $('#demoRole').onchange = e => { api.setDemoRole(e.target.value); user = api.currentUser(); afterAuth(true); };
  if ($('#resetDemo')) $('#resetDemo').onclick = () => { if (confirm('Reset sample data and revisions on this device?')) { api.resetDemo(); location.reload(); } };
  if ($('#rq')) $('#rq').onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target); try { await api.requestRole(user.uid, { affiliation: fd.get('affiliation'), reason: fd.get('reason') }); user.requestedRole = 'editor'; if (user.profile) user.profile.requestedRole = 'editor'; toast('Request sent'); viewAccount(); } catch (err) { toast('Request failed: ' + (err.code || err.message)); } };
  $('#out').onclick = async () => { if (api.demo) { api.signOut(); user = null; afterAuth(); } else await api.au.signOut(api.auth); };
}
function authMsg(e) { const c = e.code || ''; return c.includes('invalid-credential') || c.includes('wrong-password') ? 'Email or password is incorrect' : c.includes('email-already') ? 'An account already uses that email' : c.includes('weak-password') ? 'Use at least 6 characters' : c.includes('unauthorized-domain') ? 'Add this domain in Firebase Auth → Settings → Authorized domains' : (e.message || 'Sign-in failed'); }
function afterAuth(stay) { renderTabs(location.hash.slice(2)); if (stay || location.hash.startsWith('#/account')) route(); }

// ---------- admin ----------
const adm = { q: '', status: '', cemetery: '', page: 0, sel: {} };
async function viewAdmin(tab, params) {
  if (!isEditor()) return needAuth('Admin access required');
  if (!isAdmin() && !['listing', 'review', 'remembrances'].includes(tab)) tab = 'listing';
  const tabs = [['listing', 'Listing'], ['review', 'Review queue'], ['remembrances', 'Remembrances']].concat(isAdmin() ? [['users', 'Users'], ['data', 'Data & QR'], ['activity', 'Activity log']] : []);
  const head = `<div class="pad" style="padding-bottom:6px"><div class="kicker">Honor and Respect</div><h1 class="display" style="font-size:32px">Administration</h1>${api.demo ? '<div class="small muted">Demo mode. Changes are stored in this browser only.</div>' : ''}</div><nav class="admin-tabs">${tabs.map(([k, l]) => `<a href="#/admin/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
  set(head + '<div id="adm" class="loading">Loading…</div>');
  const box = $('#adm');
  if (tab === 'listing') {
    const total = await api.count().catch(() => null);
    box.className = '';
    box.innerHTML = `<div class="toolbar"><div class="searchbox" style="flex:1;min-width:220px;margin:0">${ICON.search.replace(/23/g, '17')}<input class="input" id="aq" type="search" value="${esc(adm.q)}" placeholder="Search ${total != null ? total.toLocaleString() + ' records ' : ''}by surname"></div>
      <select class="input" id="acem" style="width:auto" aria-label="Cemetery"><option value="">All cemeteries</option>${cemGroups().map(([g, names]) => `<optgroup label="${esc(g)}">${names.map(n => `<option value="${esc(n)}" ${adm.cemetery === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`).join('')}</select>
      <select class="input" id="ast" style="width:auto"><option value="">All statuses</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${adm.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
      ${isAdmin() ? '<a class="btn btn-secondary" href="#/admin/new">+ New memorial</a><button class="btn btn-primary" id="printSel" disabled>Print QR for selected</button>' : ''}
      <a class="btn btn-ghost" href="#/register">Open public register</a></div>
      <div class="table-wrap" id="tw"><table class="table"><thead><tr>${isAdmin() ? '<th><input type="checkbox" id="selAll" aria-label="Select page"></th>' : ''}<th>ID</th><th>Name</th><th>Rank</th><th>Cemetery</th><th>Location</th><th>Died</th><th>Status</th><th></th></tr></thead><tbody id="atb"></tbody></table></div>
      <div class="toolbar" id="pager"></div>`;
    const PER = 100;
    let cursors = [null], rows = [];
    const updSel = () => { const n = Object.values(adm.sel).filter(Boolean).length; if ($('#printSel')) { $('#printSel').disabled = !n; $('#printSel').textContent = n ? `Print ${n} QR code${n > 1 ? 's' : ''}` : 'Print QR for selected'; } };
    const draw = async () => {
      $('#atb').innerHTML = '<tr><td colspan="9" class="muted">Loading…</td></tr>';
      let res;
      try { res = await api.page({ q: adm.q.trim(), status: adm.status, cemetery: adm.cemetery, cursor: cursors[adm.page], limit: PER }); }
      catch (e) { indexHelp(e, $('#pager')); $('#atb').innerHTML = ''; return; }
      rows = res.items; cursors[adm.page + 1] = res.last;
      const hasNext = rows.length === PER && !!res.last;
      $('#atb').innerHTML = rows.map(m => { const v = view(m); const enc = encodeURIComponent(m.id); return `<tr>${isAdmin() ? `<td><input type="checkbox" data-sel="${esc(m.id)}" ${adm.sel[m.id] ? 'checked' : ''}></td>` : ''}<td class="tnum">${esc(m.id)}</td><td><a href="#/m/${enc}">${esc(v.name)}</a></td><td>${esc(m.rankAbbr || m.rank || '')}</td><td>${esc(m.cemetery || '')}</td><td class="tnum">${esc(m.location || '')}</td><td class="tnum">${esc(m.deathYear || '')}</td><td><span class="tag sm ${v.statusClass}">${v.statusLabel}</span></td><td class="actions"><a href="#/m/${enc}/edit">Edit</a>${isAdmin() ? `<button class="linkbtn" data-qr="${esc(m.id)}">QR</button><button class="linkbtn" data-del="${esc(m.id)}">Delete</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="9" class="muted">No records.</td></tr>';
      $('#pager').innerHTML = `<span class="small muted">${total != null ? total.toLocaleString() + ' records in the register · ' : ''}${adm.cemetery ? esc(adm.cemetery) + ' · ' : ''}page ${adm.page + 1}</span><button class="btn btn-secondary" id="prev" ${adm.page ? '' : 'disabled'}>Previous</button><button class="btn btn-secondary" id="next" ${hasNext ? '' : 'disabled'}>Next</button>`;
      $('#prev').onclick = () => { adm.page--; draw(); }; $('#next').onclick = () => { adm.page++; draw(); };
      $$('[data-sel]').forEach(c => c.onchange = () => { adm.sel[c.dataset.sel] = c.checked; updSel(); });
      $$('[data-qr]').forEach(b => b.onclick = () => openPrint([rows.find(m => m.id === b.dataset.qr)]));
      $$('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Delete ' + b.dataset.del + '? This cannot be undone.')) return; await api.deleteMemorial(b.dataset.del); toast('Deleted'); draw(); });
      if ($('#selAll')) { $('#selAll').checked = false; $('#selAll').onchange = e => { rows.forEach(m => (adm.sel[m.id] = e.target.checked)); $$('[data-sel]').forEach(c => (c.checked = e.target.checked)); updSel(); }; }
      updSel();
    };
    let t;
    $('#aq').oninput = e => { adm.q = e.target.value; adm.page = 0; cursors = [null]; clearTimeout(t); t = setTimeout(draw, 300); };
    $('#ast').onchange = e => { adm.status = e.target.value; adm.page = 0; cursors = [null]; draw(); };
    $('#acem').onchange = e => { adm.cemetery = e.target.value; adm.page = 0; cursors = [null]; draw(); };
    if ($('#printSel')) $('#printSel').onclick = async () => openPrint(await api.getMany(Object.keys(adm.sel).filter(k => adm.sel[k])));
    draw();
  }
  if (tab === 'review') {
    const list = await api.pending(); const all = await api.getMany([...new Set(list.map(r => r.memorialId))]);
    box.className = 'pad';
    box.innerHTML = list.length ? list.map(r => { const m = all.find(x => x.id === r.memorialId); const diff = Object.entries(r.changes || {}).map(([k, v]) => `<div class="diff"><span class="k">${esc(k)}</span><span><s>${esc(JSON.stringify(m ? m[k] ?? '' : '').slice(0, 160))}</s><br>${esc(JSON.stringify(v).slice(0, 300))}</span></div>`).join(''); return revHTML(r, `<a href="#/m/${encodeURIComponent(r.memorialId)}" class="small">${esc(m ? view(m).name : r.memorialId)}</a>${diff}`); }).join('') : '<p class="muted">No suggestions awaiting review.</p>';
    bindReview(list, () => viewAdmin('review'));
  }
  if (tab === 'remembrances') {
    const f = ['pending', 'unconfirmed', 'published', 'hidden'].includes(params && params.get && params.get('s')) ? params.get('s') : '';
    const [all, cfg] = await Promise.all([api.remembranceQueue(), api.remembranceSettings()]);
    const list = f ? all.filter(r => r.status === f) : all;
    const [emails, mems] = await Promise.all([api.remembranceEmails(list.map(r => r.id)), api.getMany([...new Set(list.map(r => r.memorialId))])]);
    const cnt = k => all.filter(r => r.status === k).length;
    box.className = 'pad';
    box.innerHTML = `${isAdmin() ? `<label class="card remb-setting"><input type="checkbox" data-rset="requireApproval" ${cfg.requireApproval ? 'checked' : ''}><span><strong>Require approval before posts appear</strong><br><span class="small muted">Off: remembrances show on the memorial straight away and can be hidden later. On: they wait here until an editor approves them.</span></span></label>
      <label class="card remb-setting"><input type="checkbox" data-rset="requireEmailConfirmation" ${cfg.requireEmailConfirmation ? 'checked' : ''}><span><strong>Require email confirmation</strong><br><span class="small muted">Posters must open a link emailed to them before their remembrance appears. Turn this on only after the email setup in the README is done, or posts will never be confirmed.</span></span></label>` : ''}
      <div class="subtabs remb-filter">${[['', 'All', all.length], ['pending', 'Awaiting review', cnt('pending')], ['unconfirmed', 'Unconfirmed', cnt('unconfirmed')], ['published', 'Published', cnt('published')], ['hidden', 'Hidden', cnt('hidden')]].map(([k, l, n]) => `<a href="#/admin/remembrances${k ? '?s=' + k : ''}" class="${f === k ? 'on' : ''}">${l} (${n})</a>`).join('')}</div>
      ${list.length ? list.map(r => { const mm = mems.find(x => x.id === r.memorialId); return `<div class="remb-admin"><a class="small" href="#/m/${encodeURIComponent(r.memorialId)}">${esc(mm ? view(mm).name : r.memorialId)}</a><div class="small muted">Email: ${emails[r.id] ? `<a href="mailto:${esc(emails[r.id])}">${esc(emails[r.id])}</a>` : 'not available'}</div>${rembHTML(r, true)}</div>`; }).join('') : '<p class="muted">No remembrances here yet.</p>'}
      ${all.length >= 200 ? '<p class="small muted">Showing the 200 most recent.</p>' : ''}`;
    bindRembModeration(list, () => viewAdmin('remembrances', params));
    $$('[data-rset]').forEach(c => c.onchange = async e => {
      const k = c.dataset.rset, on = e.target.checked, label = k === 'requireApproval' ? 'approval' : 'email confirmation';
      try { await api.setRemembranceSettings({ [k]: on }); toast(`Remembrance ${label} turned ${on ? 'on' : 'off'}`); api.log('settings.change', `Turned ${on ? 'on' : 'off'} ${label} for remembrances`, { actorName: user.name }).catch(() => { }); }
      catch (err) { e.target.checked = !on; toast('Update failed: ' + (err.code || err.message)); }
    });
  }
  if (tab === 'activity') {
    const day = 864e5, now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const range = params.get('r') || '7d', type = params.get('t') || '', q = params.get('q') || '', pick = params.get('d') || '';
    let from = today - 6 * day, to = today + day;
    if (range === 'today') from = today;
    if (range === 'yesterday') { from = today - day; to = today; }
    if (range === '30d') from = today - 29 * day;
    if (range === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(pick)) { const [y, mo, d] = pick.split('-').map(Number); from = new Date(y, mo - 1, d).getTime(); to = from + day; }
    let list = [], err = '';
    try { list = await api.activity({ from, to, limit: 500 }); } catch (e) { console.error(e); err = e.code === 'failed-precondition' ? 'The activity log needs a Firestore index. Run firebase deploy --only firestore:indexes.' : 'Could not load activity: ' + (e.code || e.message); }
    const full = list.length >= 500;
    const ql = q.trim().toLowerCase();
    list = list.filter(a => (!type || ACT_GROUP(a.type) === type) && (!ql || [a.summary, a.actorName, a.memorialId].join(' ').toLowerCase().includes(ql)));
    const go = o => { const n = new URLSearchParams({ r: range, t: type, q, d: pick, ...o }); [...n.keys()].forEach(k => !n.get(k) && n.delete(k)); location.hash = '#/admin/activity' + (n.toString() ? '?' + n : ''); };
    const byDay = {}; list.forEach(a => { const k = new Date(a.at).toDateString(); (byDay[k] = byDay[k] || []).push(a); });
    box.className = 'pad';
    box.innerHTML = `<div class="toolbar act-filters">
        <select class="input" id="acR" aria-label="Date range">${[['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['day', 'Choose a day…']].map(([k, l]) => `<option value="${k}" ${range === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="input" type="date" id="acD" value="${esc(pick)}" aria-label="Day" ${range === 'day' ? '' : 'hidden'} max="${new Date(today).toLocaleDateString('en-CA')}">
        <select class="input" id="acT" aria-label="Type of activity"><option value="">All activity</option>${Object.entries(ACT_GROUPS).map(([k, l]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="searchbox" style="flex:1;min-width:180px;margin:0">${ICON.search.replace(/23/g, '17')}<input class="input" id="acQ" type="search" value="${esc(q)}" placeholder="Search names, memorials, details"></div></div>
      ${err ? `<p class="muted">${esc(err)}</p>` : list.length ? Object.entries(byDay).map(([d, items]) => `<h4 class="sec act-day">${esc(new Date(items[0].at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}<span class="small muted"> · ${items.length}</span></h4>${items.map(a => `<div class="act"><span class="act-time small muted tnum">${new Date(a.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span><div><div><span class="tag sm ${a.type.startsWith('remembrance') ? 'tag-accent' : 'tag-neutral'}">${esc(ACT_LABEL(a.type))}</span> <span class="small muted">${esc(a.actorName || '')}</span></div><div class="act-sum">${esc(a.summary)}</div>${a.memorialId ? `<a class="small" href="#/m/${encodeURIComponent(a.memorialId)}">Open memorial ${esc(a.memorialId)}</a>` : ''}</div></div>`).join('')}`).join('') : '<p class="muted">No activity in this period.</p>'}
      ${full ? '<p class="small muted">Showing the 500 most recent entries in this period. Narrow the dates to see older ones.</p>' : ''}`;
    $('#acR').onchange = e => go({ r: e.target.value, d: e.target.value === 'day' ? (pick || new Date(today).toLocaleDateString('en-CA')) : '' });
    $('#acD').onchange = e => go({ r: 'day', d: e.target.value });
    $('#acT').onchange = e => go({ t: e.target.value });
    let qt; $('#acQ').oninput = e => { clearTimeout(qt); qt = setTimeout(() => go({ q: e.target.value }), 400); };
  }
  if (tab === 'users') {
    const us = await api.users();
    box.className = '';
    box.innerHTML = `<form id="nu" class="card nu"><div class="card-title">Add a user</div><div class="nu-grid"><div class="field"><label>Username or email</label><input class="input" name="email" required autocapitalize="none" spellcheck="false" placeholder="e.g. jsmith or jsmith@example.org"></div><div class="field"><label>Display name</label><input class="input" name="name" placeholder="Optional"></div><div class="field"><label>Password</label><input class="input" name="password" type="text" required minlength="6" autocomplete="new-password" placeholder="At least 6 characters"></div><div class="field"><label>Role</label><select class="input" name="role">${ROLES.slice(1).map(([k, n]) => `<option value="${k}" ${k === 'contributor' ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div><div class="btnrow" style="justify-content:flex-start"><button class="btn btn-primary" type="submit" style="flex:none">Create user</button><span class="small muted" style="align-self:center">Usernames sign in as name@${esc(USERNAME_DOMAIN)}. Share the password with them directly.</span></div></form><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Request</th></tr></thead><tbody>${us.map(u => `<tr><td>${esc(u.displayName || '')}</td><td>${esc(u.email || '')}</td><td><select class="input" data-role="${esc(u.uid)}" style="width:auto">${ROLES.slice(1).map(([k, n]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td><td class="small">${u.requestedRole ? `<strong>${esc(u.requestedRole)}</strong> · ${esc(u.affiliation || '')} ${esc(u.requestReason || '')}` : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div><p class="small muted pad">Role changes take effect the next time the user opens the app.</p>`;
    $('#nu').onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target); const btn = e.target.querySelector('button'); btn.disabled = true; try { await api.createUser({ email: toEmail(fd.get('email')), password: String(fd.get('password')), name: String(fd.get('name') || '').trim(), role: fd.get('role') }); toast('User created'); viewAdmin('users'); } catch (err) { btn.disabled = false; toast('Could not create user: ' + authMsg(err)); } };
    $$('[data-role]').forEach(s => s.onchange = async () => { try { await api.setRole(s.dataset.role, s.value); toast('Role updated'); if (s.dataset.role === user.uid) { user.role = s.value; afterAuth(); } } catch (e) { toast('Update failed: ' + (e.code || e.message)); } });
  }
  if (tab === 'data') {
    box.className = 'pad';
    box.innerHTML = `<div class="admin-grid">
      <div class="card"><div class="card-title">Sample data</div><p class="card-body">Writes the ${SAMPLE.length} fictional test records (IDs like NAC-D-14-22) so the print kit, QR codes and OCR matching have something to find.</p><button class="btn btn-primary" id="seed">Load sample data</button></div>
      <div class="card"><div class="card-title">Rebuild search keys</div><p class="card-body">Run once after updating, and after any import that didn’t go through the app or the import script. Records missing search keys don’t appear in the Register or scan results.</p><button class="btn btn-primary" id="rekey">Rebuild search keys</button><div class="small muted" id="rekeyMsg"></div></div>
      <div class="card"><div class="card-title">Remove sample data</div><p class="card-body">Deletes only the fictional test records. Real and imported records are untouched. You can load them again at any time.</p><button class="btn btn-secondary" id="unseed">Remove sample data</button></div>
      <div class="card"><div class="card-title">Print test kit</div><p class="card-body">Printable test headstones for OCR, plus QR plaques for every sample record. QR codes point to <strong>${esc(qrBase())}</strong>.</p><a class="btn btn-primary" href="print.html?base=${encodeURIComponent(qrBase())}" target="_blank" rel="noopener">Open print kit</a></div>
      <div class="card"><div class="card-title">Import JSON</div><p class="card-body">An array of memorial objects. Each needs an <code>id</code>; other fields follow the schema in the README. Existing IDs are merged.</p><label class="btn btn-secondary">Choose file<input type="file" accept=".json,application/json" id="imp" hidden></label></div>
      <div class="card"><div class="card-title">Export</div><p class="card-body">Download every memorial as JSON for backup or bulk editing.</p><button class="btn btn-secondary" id="exp">Download JSON</button></div></div>`;
    $('#seed').onclick = async () => { if (!confirm(`Write ${SAMPLE.length} sample records?`)) return; try { const n = await api.seed(SAMPLE); toast(n + ' sample records loaded'); } catch (e) { toast('Seed failed: ' + (e.code || e.message)); } };
    $('#rekey').onclick = async () => { const b = $('#rekey'); b.disabled = true; try { const r = await api.rebuildKeys((s, f) => { $('#rekeyMsg').textContent = `Checked ${s.toLocaleString()} · updated ${f.toLocaleString()}`; }); $('#rekeyMsg').textContent = `Done. Checked ${r.seen.toLocaleString()}, updated ${r.fixed.toLocaleString()}.`; toast('Search keys rebuilt'); } catch (e) { toast('Rebuild failed: ' + (e.code || e.message)); } b.disabled = false; };
    $('#unseed').onclick = async () => { if (!confirm('Delete all sample records?')) return; try { const n = await api.removeSample(); toast(n ? n + ' sample records removed' : 'No sample records found'); } catch (e) { toast('Remove failed: ' + (e.code || e.message)); } };
    $('#imp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const arr = JSON.parse(await f.text()); if (!Array.isArray(arr) || arr.some(r => !r.id)) throw new Error('Expected an array of objects with an id'); if (!confirm(`Import ${arr.length} records?`)) return; const n = await api.seed(arr); toast(n + ' records imported'); } catch (err) { toast('Import failed: ' + err.message); } };
    $('#exp').onclick = async () => { const n = await api.count().catch(() => 0); if (n > 20000) return toast('Too many records for a browser export. Use Firestore export in the Firebase console.'); const all = await api.listMemorials(true); const blob = new Blob([JSON.stringify(all.map(({ searchName, ...m }) => ({ ...m, updatedAt: m.updatedAt?.toMillis ? m.updatedAt.toMillis() : m.updatedAt })), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'honor-and-respect-memorials.json'; a.click(); };
  }
}
function openPrint(list) {
  const items = list.filter(Boolean).map(m => { const v = view(m); return { id: m.id, name: v.name, lifespan: v.lifespan, location: m.location, cemetery: m.cemetery }; });
  localStorage.setItem('har-print', JSON.stringify(items));
  api.markQR(items.map(i => i.id), user, qrBase()).catch(() => { });
  window.open('print.html?mode=qr&base=' + encodeURIComponent(qrBase()), '_blank');
}

// ---------- activity log ----------
const ACT_GROUPS = { remembrance: 'Remembrances', memorial: 'Memorial edits', suggestion: 'Suggestions & reviews', user: 'Users & roles', data: 'Data & QR', settings: 'Settings' };
const ACT_GROUP = t => String(t || '').split('.')[0];
const ACT_LABEL = t => ({ 'remembrance.submitted': 'Remembrance submitted', 'remembrance.confirmed': 'Remembrance confirmed', 'remembrance.posted': 'Remembrance posted', 'remembrance.published': 'Remembrance published', 'remembrance.hidden': 'Remembrance hidden', 'remembrance.pending': 'Remembrance sent to review', 'remembrance.deleted': 'Remembrance deleted', 'remembrance.throttled': 'Email throttled', 'remembrance.error': 'Email problem', 'remembrance.cleanup': 'Cleanup', 'memorial.saved': 'Memorial saved', 'memorial.deleted': 'Memorial deleted', 'suggestion.submitted': 'Suggestion', 'suggestion.approved': 'Suggestion approved', 'suggestion.rejected': 'Suggestion rejected', 'user.created': 'User added', 'user.role': 'Role changed', 'user.request': 'Role request', 'data.seed': 'Import', 'data.removeSample': 'Sample removed', 'data.rebuildKeys': 'Search keys rebuilt', 'data.qr': 'QR plaques', 'settings.change': 'Setting changed' }[t] || t);
// Each successful change made through the app is added to the admin activity log.
const LOGGED = {
  saveMemorial: ([id, , summary]) => ['memorial.saved', `Saved ${id}${summary ? ': ' + summary : ''}`, { memorialId: id }],
  suggest: ([id, , summary]) => ['suggestion.submitted', `Suggested an edit to ${id}${summary ? ': ' + summary : ''}`, { memorialId: id }],
  review: ([rev, approve]) => [approve ? 'suggestion.approved' : 'suggestion.rejected', `${approve ? 'Approved' : 'Rejected'} ${rev.authorName || 'a contributor'}'s suggestion on ${rev.memorialId}: ${rev.summary || ''}`, { memorialId: rev.memorialId, targetId: rev.id }],
  deleteMemorial: ([id]) => ['memorial.deleted', `Deleted memorial ${id}`, { memorialId: id }],
  setRole: ([uid, r]) => ['user.role', `Changed a user's role to ${r} (${uid})`, { targetId: uid }],
  createUser: ([o]) => ['user.created', `Added user ${o.email} as ${o.role}`, {}],
  requestRole: () => ['user.request', 'Requested editor access', {}],
  seed: ([recs], n) => ['data.seed', `Imported or loaded ${n ?? recs.length} records`, {}],
  removeSample: (a, n) => ['data.removeSample', `Removed ${n} sample records`, {}],
  rebuildKeys: (a, r) => ['data.rebuildKeys', `Rebuilt search keys: checked ${r.seen}, updated ${r.fixed}`, {}],
  markQR: ([ids]) => ['data.qr', `Printed QR plaques for ${ids.length} memorial${ids.length === 1 ? '' : 's'}${ids.length <= 5 ? ': ' + ids.join(', ') : ''}`, ids.length === 1 ? { memorialId: ids[0] } : {}],
  moderateRemembrance: ([id, st, , r]) => ['remembrance.' + st, `${st === 'published' ? 'Published' : st === 'hidden' ? 'Hid' : 'Sent to review'} ${r ? r.name + "'s" : 'a'} remembrance${r ? ' on ' + r.memorialId : ''}`, r ? { targetId: id, memorialId: r.memorialId } : { targetId: id }],
  deleteRemembrance: ([id, r]) => ['remembrance.deleted', `Deleted ${r ? r.name + "'s" : 'a'} remembrance${r ? ' on ' + r.memorialId + ': "' + String(r.body || '').slice(0, 120) + (String(r.body || '').length > 120 ? '…' : '') + '"' : ''}`, r ? { targetId: id, memorialId: r.memorialId } : { targetId: id }]
};
function addActivityLog(a) {
  Object.entries(LOGGED).forEach(([k, fn]) => {
    const orig = a[k]; if (typeof orig !== 'function') return;
    a[k] = async function (...args) {
      const res = await orig.apply(this, args);
      try { if (user) { const [type, summary, extra] = fn(args, res); this.log(type, summary, { actorName: user.name, ...extra }).catch(e => console.warn('activity log', e)); } } catch (e) { console.warn('activity log', e); }
      return res;
    };
  });
  return a;
}

// ---------- boot ----------
async function boot() {
  if (!configured) {
    api = addActivityLog(new LocalAPI());
    user = api.currentUser();
    $('#banner').hidden = false;
    window.addEventListener('hashchange', route);
    return route();
  }
  try { api = addActivityLog(await makeFireAPI(firebaseConfig, { recaptchaSiteKey: RECAPTCHA_SITE_KEY })); }
  catch (e) { console.error(e); set('<div class="pad"><h2>Could not connect</h2><p class="muted">Check the Firebase settings in js/firebase-config.js.</p></div>'); return; }
  window.addEventListener('hashchange', route);
  let first = true;
  api.au.onAuthStateChanged(api.auth, async u => {
    if (u) {
      try { const p = await api.ensureProfile(u, OWNER_EMAIL); user = { uid: u.uid, email: u.email, name: p.displayName || u.displayName || u.email, role: p.role || 'contributor', profile: p }; }
      catch (e) { console.error(e); user = { uid: u.uid, email: u.email, name: u.displayName || u.email, role: 'contributor' }; }
    } else user = null;
    if (first) { first = false; route(); } else afterAuth();
  });
}
boot();
