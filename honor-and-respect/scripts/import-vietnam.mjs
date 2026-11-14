// Also available without installing anything: Admin → Data & QR → "Import Vietnam Veterans Memorial names".
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

import { DCAS_URL as FILE_URL, convertDCAS } from '../public/js/vietnam.js';

const DATA = path.resolve('data', 'vietnam');
const DAT = path.join(DATA, 'DCAS.VN.EXT08.DAT');

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
async function* lines(file) { if (!fs.existsSync(file)) return; const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'latin1' }), crlfDelay: Infinity }); for await (const l of rl) if (l.trim()) yield l; }

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
async function convert() {
  if (!fs.existsSync(DAT)) throw new Error('Run "download" first (data/vietnam/DCAS.VN.EXT08.DAT is missing).');
  const list = convertDCAS(fs.readFileSync(DAT, 'latin1'), new Date().toISOString().slice(0, 10));
  fs.writeFileSync(path.join(DATA, 'memorials.ndjson'), list.map(m => JSON.stringify(m)).join('\n') + '\n');
  console.log(`Converted ${list.length.toLocaleString()} names → data/vietnam/memorials.ndjson (${list.filter(m => !m.section).length} without a panel in the file)`);
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
