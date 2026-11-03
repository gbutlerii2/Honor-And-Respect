// Honor and Respect: Arlington National Cemetery import
// Steps:  probe → download → convert → upload   (each step can be re-run; download and upload resume)
//
//   node import-anc.mjs probe              check the API URL and show the record fields
//   node import-anc.mjs download           page through every surname letter into data/raw/*.ndjson
//   node import-anc.mjs convert            turn raw records into app memorials → data/memorials.ndjson
//   node import-anc.mjs upload [--limit N] write memorials to Firestore (needs service-account.json)
//
// Data source: ANC Burial Record Public Service Methods
//   https://www.arlingtoncemetery.mil/Developers/Burial-Record-Public-Service-Methods
// Terms: cite the retrieval date and the ANC disclaimer (done automatically in officialCitation).

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// ── Settings ────────────────────────────────────────────────────────────────
// Paste the "Example 1" URL from the ANC developer page here (use its copy button).
// The script rewrites its start / limit / q / method parameters as it pages.
const ANC_SEARCH_URL = process.env.ANC_SEARCH_URL || 'PASTE_EXAMPLE_1_URL_HERE';
const PAGE_SIZE = 1000;          // ANC: reliable between 1 and 1,000
const DELAY_MS = 1500;           // pause between requests, to be polite to the server
const LAST_NAME_COLUMN = 'PrimaryLastName';
const ONLY_CEMETERY_ID = null;   // set after "probe" if other cemeteries appear (e.g. 1)
const ID_PREFIX = 'ANC';
const DATA = path.resolve('data');
// ────────────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(path.join(DATA, 'raw'), { recursive: true });

function buildUrl(q, start, limit) {
  if (ANC_SEARCH_URL.startsWith('PASTE')) throw new Error('Set ANC_SEARCH_URL at the top of import-anc.mjs (or as an environment variable) first.');
  const u = new URL(ANC_SEARCH_URL);
  u.searchParams.set('start', String(start));
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('q', q);
  u.searchParams.set('method', 'cb');
  return u.toString();
}

// JSONP → JSON, then find the rows whatever the exact response shape is.
function parse(text) {
  const t = text.trim();
  const body = t.startsWith('{') || t.startsWith('[') ? t : t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'));
  const json = JSON.parse(body);
  const find = (o, test) => { if (!o || typeof o !== 'object') return null; for (const [k, v] of Object.entries(o)) { if (test(k, v)) return v; const r = find(v, test); if (r) return r; } return null; };
  const cols = find(json, (k, v) => /columnnames?/i.test(k) && Array.isArray(v));
  let rows = find(json, (k, v) => Array.isArray(v) && v.length && (Array.isArray(v[0]) || (typeof v[0] === 'object' && v[0] && !Array.isArray(v[0]) && Object.keys(v[0]).some(x => /lastname/i.test(x)))));
  if (Array.isArray(json) && !rows) rows = json;
  rows = rows || [];
  if (rows.length && Array.isArray(rows[0]) && cols) rows = rows.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
  const total = find(json, (k, v) => /total|count/i.test(k) && typeof v === 'number');
  return { json, rows, total };
}

async function get(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'HonorAndRespect-import/1.0' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return parse(await r.text());
    } catch (e) {
      const wait = 2000 * 2 ** i;
      console.warn(`  retry ${i + 1}/${tries} in ${wait / 1000}s: ${e.message}`);
      await sleep(wait);
    }
  }
  throw new Error('Giving up on ' + url);
}

const pick = (o, ...names) => { for (const n of names) { const k = Object.keys(o).find(x => x.toLowerCase() === n.toLowerCase()); if (k && o[k] != null && String(o[k]).trim() !== '') return String(o[k]).trim(); } return ''; };

async function probe() {
  const url = buildUrl(`${LAST_NAME_COLUMN}=smith`, 0, 3);
  console.log('GET', url);
  const { json, rows, total } = await get(url);
  console.log('Top-level keys:', Object.keys(json));
  console.log('Total reported:', total);
  console.log('Rows parsed:', rows.length);
  console.log('First record:', JSON.stringify(rows[0], null, 2));
  console.log('\nIf "Rows parsed" is 0, send the first lines of the response to whoever maintains this script.');
}

async function download() {
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const statePath = path.join(DATA, 'download-state.json');
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
  let grand = 0;
  for (const L of letters) {
    const st = state[L] || { start: 0, done: false, count: 0 };
    if (st.done) { grand += st.count; console.log(`${L.toUpperCase()}: done (${st.count})`); continue; }
    const out = fs.createWriteStream(path.join(DATA, 'raw', `${L}.ndjson`), { flags: 'a' });
    while (true) {
      const { rows } = await get(buildUrl(`${LAST_NAME_COLUMN}~${L}`, st.start, PAGE_SIZE));
      rows.forEach(r => out.write(JSON.stringify(r) + '\n'));
      st.count += rows.length; st.start += PAGE_SIZE;
      if (rows.length < PAGE_SIZE) st.done = true;
      state[L] = st; fs.writeFileSync(statePath, JSON.stringify(state, null, 1));
      process.stdout.write(`\r${L.toUpperCase()}: ${st.count.toLocaleString()} records`);
      if (st.done) break;
      await sleep(DELAY_MS);
    }
    out.end(); grand += st.count; console.log('');
    await sleep(DELAY_MS);
  }
  console.log(`Downloaded ${grand.toLocaleString()} records into data/raw/. Retrieved ${new Date().toISOString().slice(0, 10)}.`);
}

const BRANCH = { USA: 'U.S. Army', ARMY: 'U.S. Army', USN: 'U.S. Navy', NAVY: 'U.S. Navy', USMC: 'U.S. Marine Corps', USAF: 'U.S. Air Force', USCG: 'U.S. Coast Guard', USAAF: 'U.S. Army Air Forces', AAF: 'U.S. Army Air Forces', USAAC: 'U.S. Army Air Corps', USSF: 'U.S. Space Force', USPHS: 'U.S. Public Health Service', NOAA: 'NOAA Corps' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function date(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return { text: '', year: null };
  return { text: `${MONTHS[+m[1] - 1]} ${+m[2]}, ${m[3]}`, year: +m[3] };
}
function title(s) {
  return String(s || '').toLowerCase().replace(/(^|[\s\-'])([a-z])/g, (_, p, c) => p + c.toUpperCase()).replace(/\bMc([a-z])/g, (_, c) => 'Mc' + c.toUpperCase()).trim();
}
function conflictFor(dy, branch) {
  if (!dy || !branch) return '';
  if (dy >= 1917 && dy <= 1919) return 'World War I';
  if (dy >= 1941 && dy <= 1946) return 'World War II';
  if (dy >= 1950 && dy <= 1953) return 'Korean War';
  return ''; // only set where the death year itself implies wartime; editors refine the rest
}

function toMemorial(r, retrieved) {
  const iss = pick(r, 'ISS_ID', 'IssId', 'ID');
  if (!iss) return null;
  if (ONLY_CEMETERY_ID != null && String(pick(r, 'CemeteryId')) !== String(ONLY_CEMETERY_ID)) return null;
  const given = title(pick(r, 'PRIMARYFIRSTNAME', 'PrimaryFirstName'));
  const middle = title(pick(r, 'PRIMARYMIDDLENAME', 'PrimaryMiddleName'));
  const surname = title(pick(r, 'PRIMARYLASTNAME', 'PrimaryLastName'));
  const suffix = pick(r, 'SUFFIX', 'Suffix');
  const dob = date(pick(r, 'DOB')), dod = date(pick(r, 'DOD')), doi = date(pick(r, 'DOI'));
  const b = pick(r, 'BRANCHOFSERVICE', 'BranchOfService').toUpperCase().replace(/[^A-Z]/g, '');
  const branch = BRANCH[b] || pick(r, 'BRANCHOFSERVICE', 'BranchOfService');
  const rank = pick(r, 'Rank', 'RANK');
  const section = pick(r, 'CEMETERYSECTION', 'CemeterySection');
  const row = pick(r, 'GRAVEROW', 'GraveRow');
  const grave = pick(r, 'GRAVE', 'Grave');
  const court = pick(r, 'COURT', 'Court'), colSec = pick(r, 'COLUMBARIUMSECTION'), column = pick(r, 'COLUMN'), niche = pick(r, 'NICHE');
  const location = niche
    ? ['Columbarium', court && `Court ${court}`, colSec && `Section ${colSec}`, column && `Column ${column}`, `Niche ${niche}`].filter(Boolean).join(' · ')
    : [section && `Section ${section}`, row && `Row ${row}`, grave && `Site ${grave}`].filter(Boolean).join(' · ');
  const fullName = [given, middle, surname, suffix].filter(Boolean).join(' ');
  return {
    id: `${ID_PREFIX}-${iss}`,
    fullName, givenName: given, middleName: middle, surname, suffix,
    surnameKey: surname.toUpperCase().replace(/[^A-Z]/g, ''),
    rank, rankAbbr: rank, branch,
    birthDate: dob.text, birthYear: dob.year, deathDate: dod.text, deathYear: dod.year, intermentDate: doi.text,
    relationship: pick(r, 'RELATIONSHIP', 'Relationship'),
    conflict: conflictFor(dod.year, branch),
    cemetery: 'Arlington National Cemetery', cemeteryKey: 'arlington',
    section: section || (niche ? 'Columbarium' : ''), row, site: grave || niche, location,
    locationId: pick(r, 'LOCATIONID', 'LocationId'),
    record: { source: 'ANC Explorer · Interment record', externalId: iss, url: 'https://ancexplorer.army.mil/', status: 'linked' },
    officialCitation: `Arlington National Cemetery burial record (ISS ${iss}), retrieved ${retrieved} from ArlingtonCemetery.mil. ArlingtonCemetery.mil and the U.S. Army cannot vouch for the data or analyses derived from these data after the data have been retrieved from ArlingtonCemetery.mil.`,
    importedFrom: 'anc', importedAt: retrieved,
    searchName: [fullName, rank, branch, location, iss].join(' ').toLowerCase()
  };
}

async function* lines(file) { const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity }); for await (const l of rl) if (l.trim()) yield l; }

async function convert() {
  const retrieved = new Date().toISOString().slice(0, 10);
  const out = fs.createWriteStream(path.join(DATA, 'memorials.ndjson'));
  const seen = new Set(); let n = 0, skipped = 0;
  for (const f of fs.readdirSync(path.join(DATA, 'raw')).filter(f => f.endsWith('.ndjson')).sort()) {
    for await (const l of lines(path.join(DATA, 'raw', f))) {
      const m = toMemorial(JSON.parse(l), retrieved);
      if (!m || seen.has(m.id)) { skipped++; continue; }
      seen.add(m.id); out.write(JSON.stringify(m) + '\n'); n++;
    }
  }
  out.end();
  console.log(`Converted ${n.toLocaleString()} memorials (${skipped} skipped as duplicates or filtered) → data/memorials.ndjson`);
}

async function upload() {
  const limitArg = process.argv.indexOf('--limit');
  const max = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
  if (!fs.existsSync('service-account.json')) throw new Error('Put your Firebase service account key in scripts/service-account.json (Project settings → Service accounts → Generate new private key).');
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync('service-account.json', 'utf8'))) });
  const db = getFirestore();
  const statePath = path.join(DATA, 'upload-state.json');
  const done = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')).lines : 0;
  let i = 0, written = 0, batch = db.batch(), inBatch = 0;
  const commit = async () => { if (!inBatch) return; await batch.commit(); written += inBatch; fs.writeFileSync(statePath, JSON.stringify({ lines: i })); process.stdout.write(`\rUploaded ${(done + written).toLocaleString()}`); batch = db.batch(); inBatch = 0; };
  for await (const l of lines(path.join(DATA, 'memorials.ndjson'))) {
    i++;
    if (i <= done) continue;
    if (written + inBatch >= max) break;
    const { id, ...m } = JSON.parse(l);
    // merge: official fields refresh; biography, photos, sources and status set in the app are kept
    batch.set(db.collection('memorials').doc(id), m, { merge: true });
    if (++inBatch === 400) await commit();
  }
  await commit();
  console.log(`\nDone. ${written.toLocaleString()} written this run.`);
}

const cmd = process.argv[2];
const run = { probe, download, convert, upload }[cmd];
if (!run) { console.log('Usage: node import-anc.mjs probe | download | convert | upload [--limit N]'); process.exit(1); }
run().catch(e => { console.error('\n' + e.message); process.exit(1); });
