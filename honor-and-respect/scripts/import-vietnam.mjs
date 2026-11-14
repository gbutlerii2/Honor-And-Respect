// Honor and Respect: Vietnam Veterans Memorial names (National Archives DCAS extract)
// Steps:  download → convert → upload   (or "all" for the three in a row; upload resumes where it stopped)
//
//   node import-vietnam.mjs download          fetch the National Archives file into data/vietnam/ (24 MB, one request)
//   node import-vietnam.mjs convert           turn it into app memorials → data/vietnam/memorials.ndjson
//   node import-vietnam.mjs upload [--limit N] write memorials to Firestore (needs service-account.json)
//   node import-vietnam.mjs all               download (if not already there), convert and upload
//
// Source: "Vietnam Conflict Extract Data File, as of April 29, 2008" from the Defense Casualty Analysis System,
// National Archives identifier 2240992, https://catalog.archives.gov/id/2240992 (Record Group 330). 58,220 records,
// one per name on The Wall, pipe-delimited. National Archives marks it "Access: Unrestricted, Use: Unrestricted".
// The file includes each name's Wall location ("63W 014" = panel 63W, line 14).
//
// What is stored: name, rank, branch, unit, hometown and state, dates of birth and casualty, casualty province and
// type, and panel/line. The file's first column (service number, often a Social Security number) is never read
// into the app. IDs are built from the Wall location and name (VVM-63W-014-AADLAND-G), so they stay the same when
// the import is run again. Each memorial links to the person's search on the VVMF Wall of Faces for photos and
// remembrances.
//
// The cloud machines Claude runs on cannot reach catalog.archives.gov; run this on your own computer. If the
// download is blocked there too, download the file from the catalog page in a browser and put it at
// data/vietnam/DCAS.VN.EXT08.DAT.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const FILE_URL = 'https://catalog.archives.gov/medialz/electronic-records/rg-330/dcase/DCAS.VN.EXT08.DAT';
const DATA = path.resolve('data', 'vietnam');
const DAT = path.join(DATA, 'DCAS.VN.EXT08.DAT');
const CEMETERY_KEY = 'vietnam-veterans-memorial';                 // must match public/js/cemeteries.js
const CEMETERY_NAME = 'Vietnam Veterans Memorial';
const SOURCE = 'National Archives, Vietnam Conflict Extract Data File (DCAS), as of April 29, 2008, NAID 2240992';

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
async function* lines(file) { if (!fs.existsSync(file)) return; const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'latin1' }), crlfDelay: Infinity }); for await (const l of rl) if (l.trim()) yield l; }

// Columns of the pipe-delimited file (0-based) that the app uses. Column 0 is the service number; it is skipped.
const C = { name: 4, branch: 6, rank: 7, born: 11, sex: 12, city: 13, county: 14, state: 16, stateName: 17, province: 26, country: 30, unit: 31, died: 34, deathYear: 35, hostile: 42, casualtyType: 44, reason: 45, wall: 49 };

async function download() {
  fs.mkdirSync(DATA, { recursive: true });
  if (fs.existsSync(DAT) && !process.argv.includes('--force')) return console.log('Already downloaded: data/vietnam/DCAS.VN.EXT08.DAT (use --force to fetch again).');
  console.log('Downloading', FILE_URL);
  const res = await fetch(FILE_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HonorAndRespect-import/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}. Download it in a browser from https://catalog.archives.gov/id/2240992 and save it as data/vietnam/DCAS.VN.EXT08.DAT`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(DAT, buf);
  console.log(`Saved ${(buf.length / 1e6).toFixed(1)} MB → data/vietnam/DCAS.VN.EXT08.DAT`);
}

// ── convert ─────────────────────────────────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function date(s) {
  const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m || m[1] === '0000' || +m[2] < 1 || +m[2] > 12) return { text: '', year: null };
  return { text: +m[3] ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : `${MONTHS[+m[2] - 1]} ${m[1]}`, year: +m[1] };
}
const SUFFIX = /^(JR|SR|II|III|IV|V|VI)$/;
const title = s => String(s || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\bMc(\p{L})/gu, (_, b) => 'Mc' + b.toUpperCase()).replace(/\b(Ii|Iii|Iv|Vi)\b/g, x => x.toUpperCase());
const BRANCH = { ARMY: 'U.S. Army', 'MARINE CORPS': 'U.S. Marine Corps', NAVY: 'U.S. Navy', 'AIR FORCE': 'U.S. Air Force', 'COAST GUARD': 'U.S. Coast Guard' };

/** "AARON THOMAS MILTON JR" (surname first) → parts, plus the name as engraved ("THOMAS M AARON JR"). */
export function splitName(raw) {
  const t = String(raw || '').toUpperCase().replace(/[^A-Z' -]/g, ' ').split(/\s+/).filter(Boolean);
  const surname = t.shift() || '';
  const suffix = t.length > 1 && SUFFIX.test(t[t.length - 1]) ? t.pop() : '';
  const given = t.shift() || '';
  const middle = t.join(' ');
  const wall = [given, ...t.map(w => w[0]), surname, suffix].filter(Boolean).join(' ');
  return { surname, given, middle, suffix, wall };
}
/** "63W 014" → { panel: '63W', line: '14' }; tolerates the few odd spacings in the file. */
export function wallLocation(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\s*([EW])\s*(\d{1,3})?$/i);
  return m ? { panel: `${+m[1]}${m[2].toUpperCase()}`, line: m[3] ? String(+m[3]) : '' } : { panel: '', line: '' };
}

export function toMemorial(cols, retrieved) {
  const n = splitName(cols[C.name]);
  if (!n.surname) return null;
  const { panel, line } = wallLocation(cols[C.wall]);
  const born = date(cols[C.born]), died = date(cols[C.died]);
  const surname = title(n.surname), given = title(n.given), middle = title(n.middle);
  const suffix = /^(JR|SR)$/.test(n.suffix) ? title(n.suffix) : n.suffix;
  const unit = String(cols[C.unit] || '').trim();
  const city = title(cols[C.city]), state = String(cols[C.state] || '').trim();
  const location = panel ? `Panel ${panel}${line ? ` · Line ${line}` : ''}` : '';
  const key = [panel || 'NP', line || '0', n.surname.replace(/[^A-Z]/g, ''), (n.given[0] || '') + (n.middle[0] || '')].join('-');
  const m = {
    id: `VVM-${key}`,
    fullName: [given, middle, surname, suffix].filter(Boolean).join(' '),
    wallName: n.wall,
    givenName: given, middleName: middle, surname, suffix,
    surnameKey: n.surname.replace(/[^A-Z]/g, ''),
    rank: String(cols[C.rank] || '').trim(), rankAbbr: String(cols[C.rank] || '').trim(),
    branch: BRANCH[String(cols[C.branch] || '').trim()] || title(cols[C.branch]),
    unit, serviceNumber: '',
    enteredFrom: state, hometown: [city, state].filter(Boolean).join(', '), birthplace: '',
    birthDate: born.text, birthYear: born.year, deathDate: died.text, deathYear: died.year || (+cols[C.deathYear] || null),
    casualtyProvince: title(cols[C.province]), casualtyType: title(cols[C.casualtyType]),
    conflict: 'Vietnam War',
    cemetery: CEMETERY_NAME, cemeteryKey: CEMETERY_KEY,
    section: panel, row: line, site: '', location, missing: null,
    awards: [],
    record: { source: 'VVMF · Wall of Faces', externalId: '', url: 'https://www.vvmf.org/Wall-of-Faces/search/results?search-term=' + encodeURIComponent(`${n.given} ${n.surname}`), status: 'possible' },
    officialCitation: `Vietnam Veterans Memorial${location ? ', ' + location.replace(' · ', ', ') : ''}. ${SOURCE}, retrieved ${retrieved}.`,
    importedFrom: 'nara-dcas', importedAt: retrieved, detailsFetched: true
  };
  m.searchName = [m.fullName, m.wallName, m.givenName, m.middleName, m.surname, m.unit, m.location, m.id].filter(Boolean).join(' ').toLowerCase();
  return m;
}

async function convert() {
  if (!fs.existsSync(DAT)) throw new Error('Run "download" first (data/vietnam/DCAS.VN.EXT08.DAT is missing).');
  const retrieved = new Date().toISOString().slice(0, 10);
  const out = fs.createWriteStream(path.join(DATA, 'memorials.ndjson'));
  const seen = new Map(); let n = 0, noPanel = 0, skipped = 0;
  for await (const l of lines(DAT)) {
    const m = toMemorial(l.split('|'), retrieved);
    if (!m) { skipped++; continue; }
    const k = seen.get(m.id) || 0; seen.set(m.id, k + 1);
    if (k) m.id += '-' + (k + 1);               // same panel, line, surname and initials: keep both
    if (!m.section) noPanel++;
    out.write(JSON.stringify(m) + '\n'); n++;
  }
  await new Promise(r => out.end(r));
  console.log(`Converted ${n.toLocaleString()} names → data/vietnam/memorials.ndjson (${noPanel} without a panel in the file; ${skipped} skipped)`);
}

// ── upload ──────────────────────────────────────────────────────────────────
async function upload() {
  const max = Number(arg('--limit')) || Infinity;
  if (!fs.existsSync('service-account.json')) throw new Error('Put your Firebase service account key in scripts/service-account.json (Project settings → Service accounts → Generate new private key). Never commit it.');
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
  console.log(`\nDone. ${written.toLocaleString()} written this run. Delete data/vietnam/upload-state.json before uploading a new convert.`);
}

const all = async () => { await download(); await convert(); await upload(); };
const cmd = process.argv[2];
const run = { download, convert, upload, all }[cmd];
if (process.argv[1]?.endsWith('import-vietnam.mjs')) {
  if (!run) { console.log('Usage: node import-vietnam.mjs download | convert | upload [--limit N] | all'); process.exit(1); }
  run().catch(e => { console.error('\n' + e.message); process.exit(1); });
}
