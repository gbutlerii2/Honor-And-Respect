// Honor and Respect: Vietnam Veterans Memorial names (VVMF Wall of Faces)
// Steps:  probe → fetch → convert → upload   (fetch and upload resume where they stopped)
//
//   node import-vvmf.mjs probe [--url <profile URL>] fetch one Wall of Faces profile and show what was read from it
//   node import-vvmf.mjs fetch [--limit N]          read every profile listed in data/vvmf/urls.txt (one profile URL
//                                                   per line) into data/vvmf/profiles.ndjson
//   node import-vvmf.mjs convert                    turn profiles into app memorials → data/vvmf/memorials.ndjson
//   node import-vvmf.mjs upload  [--limit N]        write memorials to Firestore (needs service-account.json)
//
// Source: the Vietnam Veterans Memorial Fund's Wall of Faces, https://www.vvmf.org/Wall-of-Faces/<id>/<NAME>.
// Each profile shows the name as engraved, full name, panel/line ("22E/29"), dates of birth and casualty,
// casualty province, home of record, branch and rank. Profile ids run from 1 to a little over 58,000, but a
// profile only opens with the name part of its URL (/Wall-of-Faces/9239/ alone shows the search page), and the
// site's search does not page through every name, so this script needs the list of profile URLs to start from.
// Ask VVMF for it (or for a names file with panel/line, which would make the fetch step unnecessary).
//
// What is stored: only the facts needed to find a name (name, panel and line, dates, hometown, branch, rank)
// and a link back to the person's Wall of Faces profile. No photos and no remembrances are copied; the
// memorial page links out to VVMF for those.
//
// Terms (checked 2026-11-12): VVMF publishes no terms of use for the Wall of Faces, only a privacy statement.
// Its robots.txt allows ordinary crawlers (AI crawlers are blocked) and sets "Content-Signal: search=yes,
// ai-train=no, use=reference". Get VVMF's OK before a full run. The cloud machines Claude runs on cannot reach
// vvmf.org directly; run this on your own computer.
//
// Be polite: one request at a time with DELAY_MS between requests. A full run is ~58,300 requests
// (about 24 hours at the default delay). It resumes where it stopped.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// ── Settings ────────────────────────────────────────────────────────────────
const SITE = 'https://www.vvmf.org';
const DELAY_MS = Number(process.env.VVMF_DELAY_MS || 1500);   // pause between requests (plus up to 500 ms of jitter)
const USER_AGENT = 'Mozilla/5.0 (compatible; HonorAndRespect-import/1.0)';
const ID_PREFIX = 'VVM';
const CEMETERY_KEY = 'vietnam-veterans-memorial';                 // must match public/js/cemeteries.js
const CEMETERY_NAME = 'Vietnam Veterans Memorial';
const DATA = path.resolve('data', 'vvmf');
// ────────────────────────────────────────────────────────────────────────────

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function* lines(file) { if (!fs.existsSync(file)) return; const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity }); for await (const l of rl) if (l.trim()) yield l; }

// ── reading a profile ───────────────────────────────────────────────────────
const LABELS = ['WALL NAME', 'PANEL / LINE', 'DATE OF BIRTH', 'CASUALTY PROVINCE', 'DATE OF CASUALTY', 'HOME OF RECORD', 'COUNTY OF RECORD', 'STATE', 'BRANCH OF SERVICE', 'RANK'];
const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

/** Reads a Wall of Faces profile page into plain fields. Returns null when the page has no panel/line. */
export function parseProfile(html, id) {
  const main = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const text = decode(main.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(p|div|li|h\d|span|section|dt|dd|strong|label|a)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '));
  const rows = text.split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = { id: String(id) };
  for (let i = 0; i < rows.length - 1; i++) {
    const k = rows[i].toUpperCase();
    if (LABELS.includes(k) && !(k in out) && !LABELS.includes(rows[i + 1].toUpperCase())) out[k] = rows[i + 1];
  }
  // Full name: the line right after "HONORED ON PANEL ..., LINE ... OF THE WALL".
  const h = rows.findIndex(r => /^HONORED ON PANEL/i.test(r));
  if (h >= 0 && rows[h + 1] && !LABELS.includes(rows[h + 1].toUpperCase())) out.FULL_NAME = rows[h + 1];
  if (!out['PANEL / LINE']) {
    const m = h >= 0 && rows[h].match(/PANEL\s+(\w+),\s*LINE\s+(\d+)/i);
    if (m) out['PANEL / LINE'] = `${m[1]}/${m[2]}`;
  }
  return out['PANEL / LINE'] && out['WALL NAME'] ? out : null;
}

const profileId = url => (String(url).match(/Wall-of-Faces\/(\d+)\//i) || [])[1];
async function getProfile(url) {
  const id = profileId(url);
  if (!id) throw new Error(`Not a Wall of Faces profile URL: ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, redirect: 'follow' });
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const p = parseProfile(await res.text(), id);
  return p ? { profile: { ...p, url: res.url } } : { missing: true };
}

async function probe() {
  const url = arg('--url') || `${SITE}/Wall-of-Faces/9239/JERRY-F-CLARK/`;
  const r = await getProfile(url);
  if (r.missing) return console.log(`${url}: not found or no panel/line on the page.`);
  console.log(JSON.stringify(r.profile, null, 2));
  console.log('\nAs an app memorial:\n' + JSON.stringify(toMemorial(r.profile, new Date().toISOString().slice(0, 10)), null, 2));
}

async function fetchAll() {
  fs.mkdirSync(DATA, { recursive: true });
  const list = path.join(DATA, 'urls.txt'), file = path.join(DATA, 'profiles.ndjson'), statePath = path.join(DATA, 'fetch-state.json');
  if (!fs.existsSync(list)) throw new Error('Put the Wall of Faces profile URLs in data/vvmf/urls.txt, one per line.');
  const max = Number(arg('--limit')) || Infinity;
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { done: 0 };
  const out = fs.createWriteStream(file, { flags: 'a' });
  let i = 0, n = 0, missing = 0, errors = 0;
  for await (const raw of lines(list)) {
    const url = raw.trim();
    if (++i <= state.done) continue;
    if (n >= max) break;
    for (;;) {
      try {
        const r = await getProfile(url);
        if (r.missing) missing++; else { out.write(JSON.stringify(r.profile) + '\n'); n++; }
        errors = 0; break;
      } catch (e) {
        if (++errors >= 5) throw new Error(`Stopping after repeated errors at line ${i}: ${e.message}. Re-run to resume.`);
        console.warn(`\n${e.message}; waiting before retrying`); await sleep(30000 * errors);
      }
    }
    fs.writeFileSync(statePath, JSON.stringify({ done: i }));
    process.stdout.write(`\rline ${i} · ${n.toLocaleString()} saved · ${missing} without panel/line`);
    await sleep(DELAY_MS + Math.random() * 500);
  }
  await new Promise(r => out.end(r));
  console.log(`\nSaved ${n.toLocaleString()} profiles this run → data/vvmf/profiles.ndjson`);
}

// ── convert ─────────────────────────────────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function date(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? { text: `${MONTHS[+m[1] - 1]} ${+m[2]}, ${m[3]}`, year: +m[3] } : { text: '', year: null };
}
const SUFFIX = /^(JR|SR|II|III|IV|V)$/;
const title = s => String(s || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\bMc(\p{L})/gu, (_, b) => 'Mc' + b.toUpperCase()).replace(/\b(Ii|Iii|Iv)\b/g, x => x.toUpperCase());
const BRANCH = { ARMY: 'U.S. Army', 'MARINE CORPS': 'U.S. Marine Corps', NAVY: 'U.S. Navy', 'AIR FORCE': 'U.S. Air Force', 'COAST GUARD': 'U.S. Coast Guard' };

/** Splits an engraved name ("MIGUEL A C ALICEA", "DAVID CULP JR") into given, middle initials, surname and suffix. */
export function splitWallName(wall) {
  const t = String(wall || '').toUpperCase().replace(/[^A-Z' -]/g, ' ').split(/\s+/).filter(Boolean);
  const suffix = t.length > 2 && SUFFIX.test(t[t.length - 1]) ? t.pop() : '';
  const given = t.shift() || '';
  const mids = [];
  while (t.length > 1 && t[0].length === 1) mids.push(t.shift());
  return { given, middle: mids.join(' '), surname: t.join(' '), suffix };
}

export function toMemorial(p, retrieved) {
  const n = splitWallName(p['WALL NAME']);
  // The full name gives the middle name in full when there is one ("JERRY FURMAN CLARK" → Furman).
  const full = String(p.FULL_NAME || '').toUpperCase().split(/\s+/).filter(Boolean);
  let middle = n.middle;
  if (n.middle.length === 1 && full.length >= 3 && full[0] === n.given && full[1][0] === n.middle) middle = full[1];
  const [panel, line] = String(p['PANEL / LINE']).split('/').map(s => s.trim());
  const born = date(p['DATE OF BIRTH']), died = date(p['DATE OF CASUALTY']);
  const surname = title(n.surname), given = title(n.given), suffix = n.suffix === 'JR' || n.suffix === 'SR' ? title(n.suffix) : n.suffix;
  const m = {
    id: `${ID_PREFIX}-${p.id}`,
    fullName: [given, title(middle), surname, suffix].filter(Boolean).join(' '),
    wallName: p['WALL NAME'],
    givenName: given, middleName: title(middle), surname, suffix,
    surnameKey: n.surname.replace(/[^A-Z]/g, ''),
    rank: p.RANK || '', rankAbbr: p.RANK || '', branch: BRANCH[String(p['BRANCH OF SERVICE'] || '').toUpperCase()] || title(p['BRANCH OF SERVICE']),
    unit: '', serviceNumber: '',
    enteredFrom: p.STATE || '', hometown: [title(p['HOME OF RECORD']), p.STATE].filter(Boolean).join(', '),
    birthDate: born.text, birthYear: born.year, deathDate: died.text, deathYear: died.year,
    casualtyProvince: title(p['CASUALTY PROVINCE']),
    conflict: 'Vietnam War',
    cemetery: CEMETERY_NAME, cemeteryKey: CEMETERY_KEY,
    section: panel, row: line, site: '', location: `Panel ${panel} · Line ${line}`, missing: null,
    awards: [],
    record: { source: 'VVMF · Wall of Faces', externalId: p.id, url: p.url || `${SITE}/Wall-of-Faces/${p.id}/`, status: 'linked' },
    officialCitation: `Vietnam Veterans Memorial, Panel ${panel}, Line ${line}. Name and details from the Vietnam Veterans Memorial Fund Wall of Faces profile ${p.id}, retrieved ${retrieved}.`,
    importedFrom: 'vvmf', importedAt: retrieved, detailsFetched: true
  };
  m.searchName = [m.fullName, m.wallName, m.givenName, m.middleName, m.surname, m.location, m.id].filter(Boolean).join(' ').toLowerCase();
  return m;
}

async function convert() {
  const retrieved = new Date().toISOString().slice(0, 10);
  const out = fs.createWriteStream(path.join(DATA, 'memorials.ndjson'));
  const seen = new Set(); let n = 0;
  for await (const l of lines(path.join(DATA, 'profiles.ndjson'))) {
    const p = JSON.parse(l); if (seen.has(p.id)) continue; seen.add(p.id);
    out.write(JSON.stringify(toMemorial(p, retrieved)) + '\n'); n++;
  }
  await new Promise(r => out.end(r));
  console.log(`Converted ${n.toLocaleString()} names → data/vvmf/memorials.ndjson`);
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
  console.log(`\nDone. ${written.toLocaleString()} written this run. Delete data/vvmf/upload-state.json before uploading a new convert.`);
}

const cmd = process.argv[2];
const run = { probe, fetch: fetchAll, convert, upload }[cmd];
if (process.argv[1]?.endsWith('import-vvmf.mjs')) {
  if (!run) { console.log('Usage: node import-vvmf.mjs probe [--url URL] | fetch [--limit N] | convert | upload [--limit N]'); process.exit(1); }
  run().catch(e => { console.error('\n' + e.message); process.exit(1); });
}
