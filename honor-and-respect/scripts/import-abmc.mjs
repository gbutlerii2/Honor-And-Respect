// Honor and Respect: ABMC overseas cemetery import (weremember.abmc.gov)
// Steps:  probe → list → details → convert → upload   (every step can be re-run; list, details and upload resume)
//
//   node import-abmc.mjs probe                      open a session, show cemetery counts and one full record
//   node import-abmc.mjs list    [--cemetery a,b]   page through the search results into data/abmc/list/<slug>.ndjson
//   node import-abmc.mjs details [--cemetery a,b] [--limit N]
//                                                   fetch each soldier's detail record (plot, row, grave, date of death,
//                                                   awards) into data/abmc/details/<slug>.ndjson, one request per soldier
//   node import-abmc.mjs convert [--cemetery a,b]   turn records into app memorials → data/abmc/memorials.ndjson
//   node import-abmc.mjs upload  [--limit N]        write memorials to Firestore (needs service-account.json)
//
//   --cemetery takes slugs (normandy,brittany) and defaults to normandy,brittany. Use --cemetery all for every ABMC site.
//
// Data source: ABMC burial search at https://weremember.abmc.gov (Knowvation by PTFS). It has no bulk download, but the
// search page reads from a public JSON catalog service (/aw-server/awcsw, OGC CSW 2.0.2). This script calls the same
// service the page does, slowly. The service needs the anonymous session that the website opens in a browser, so the
// script drives a headless browser (Playwright) to open the site once and then makes its requests from inside that page.
//
// Terms: ABMC says information on its website is public domain unless a copyright is indicated, and asks that ABMC be
// cited as the source (done automatically in officialCitation). There is no robots.txt on weremember.abmc.gov.
//
// Be polite: one request at a time, DELAY_MS between requests, and back off on errors. A full run of details for
// Normandy + Brittany is about 15,850 requests (roughly 8–9 hours at the default delay). Every ABMC site is ~224,600.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// ── Settings ────────────────────────────────────────────────────────────────
const SITE = 'https://weremember.abmc.gov';
const DELAY_MS = Number(process.env.ABMC_DELAY_MS || 1500);   // pause between requests (plus up to 500 ms of jitter)
const PAGE_SIZE = 500;                                        // records per list request (the service allows 500)
const USER_AGENT = 'Mozilla/5.0 (compatible; HonorAndRespect-import/1.0)';
const LIBRARIES = 'ABMCBurialLib OR Reconciliation_Differences'; // what the public search page queries
const ID_PREFIX = 'ABMC';
const DATA = path.resolve('data', 'abmc');
// ────────────────────────────────────────────────────────────────────────────

// ABMC's cemetery names (exactly as the search service spells them) → app slug and the name the app uses.
// Slugs and app names match public/js/cemeteries.js.
export const ABMC_CEMETERIES = {
  'Aisne-Marne American Cemetery': { slug: 'aisne-marne' },
  'Ardennes American Cemetery': { slug: 'ardennes' },
  'Brittany American Cemetery': { slug: 'brittany' },
  'Brookwood American Cemetery': { slug: 'brookwood' },
  'Cambridge American Cemetery': { slug: 'cambridge' },
  'Clark Veterans Cemetery': { slug: 'clark' },
  'Corozal': { slug: 'corozal', name: 'Corozal American Cemetery' },
  'Corozal American Cemetery': { slug: 'corozal' },
  'East Coast Memorial': { slug: 'east-coast-memorial' },
  'Epinal American Cemetery': { slug: 'epinal' },
  'Flanders Field American Cemetery': { slug: 'flanders-field' },
  'Florence American Cemetery': { slug: 'florence' },
  'Henri-Chapelle American Cemetery': { slug: 'henri-chapelle' },
  'Honolulu Memorial': { slug: 'honolulu-memorial' },
  'Lafayette Escadrille Memorial Cemetery': { slug: 'lafayette-escadrille' },
  'Lorraine American Cemetery': { slug: 'lorraine' },
  'Luxembourg American Cemetery': { slug: 'luxembourg' },
  'Manila American Cemetery': { slug: 'manila' },
  'Meuse-Argonne American Cemetery': { slug: 'meuse-argonne' },
  'Mexico City National Cemetery': { slug: 'mexico-city' },
  'Netherlands American Cemetery': { slug: 'netherlands' },
  'Normandy American Cemetery': { slug: 'normandy' },
  'North Africa American Cemetery': { slug: 'north-africa' },
  'Oise-Aisne American Cemetery': { slug: 'oise-aisne' },
  'Rhone American Cemetery': { slug: 'rhone' },
  'Sicily-Rome American Cemetery': { slug: 'sicily-rome' },
  'Somme American Cemetery': { slug: 'somme' },
  'St. Mihiel American Cemetery': { slug: 'st-mihiel' },
  'Suresnes American Cemetery': { slug: 'suresnes' },
  'West Coast Memorial': { slug: 'west-coast-memorial' }
};
// Memorials that hold only names of the missing (no graves).
const MISSING_ONLY = new Set(['east-coast-memorial', 'honolulu-memorial', 'west-coast-memorial']);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pause = () => sleep(DELAY_MS + Math.floor(Math.random() * 500));
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

function selectedSources() {
  const want = (arg('--cemetery') || 'normandy,brittany').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const all = Object.keys(ABMC_CEMETERIES);
  if (want.includes('all')) return all;
  const picked = all.filter(n => want.includes(ABMC_CEMETERIES[n].slug));
  const known = new Set(all.map(n => ABMC_CEMETERIES[n].slug));
  const unknown = want.filter(w => !known.has(w));
  if (unknown.length) throw new Error(`Unknown cemetery slug(s): ${unknown.join(', ')}. Known: ${[...known].join(', ')}`);
  return picked;
}
const fileKey = abmcName => abmcName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Session: a headless browser holding the website's anonymous session ─────
let browser, page, requestsMade = 0;
async function openSession() {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { throw new Error('Playwright is missing. In the scripts folder run:  npm install  &&  npx playwright install chromium'); }
  if (!browser) browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: USER_AGENT });
  page = await ctx.newPage();
  await page.goto(SITE + '/s?a=b&v=G&sort=title:ASC', { waitUntil: 'networkidle', timeout: 90000 });
  await sleep(2000);
}
async function closeSession() { if (browser) await browser.close(); browser = null; }

// One GET to the catalog service, made from inside the page so the session cookie goes with it.
async function csw(params, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      if (!page) await openSession();
      const qs = new URLSearchParams({ typenames: 'aw:iStoreRecord', OUTPUTFORMAT: 'application/json', SERVICE: 'CSW', VERSION: '2.0.2', ...params }).toString();
      const { status, text } = await page.evaluate(async q => {
        const r = await fetch('/aw-server/awcsw?' + q, { headers: { Accept: 'application/json' } });
        return { status: r.status, text: await r.text() };
      }, qs);
      requestsMade++;
      if (status === 401 || status === 403 || /^Unauthori[sz]ed/i.test(text)) { page = null; throw new Error('session expired (' + status + ')'); }
      if (status === 429 || status >= 500) throw new Error('HTTP ' + status);
      const json = JSON.parse(text);
      if (json['ns34:ExceptionReport'] || Object.keys(json).some(k => /ExceptionReport/.test(k))) throw new Error('service exception: ' + text.slice(0, 300));
      return json;
    } catch (e) {
      const wait = Math.min(5000 * 2 ** i, 300000);
      console.warn(`\n  retry ${i + 1}/${tries} in ${Math.round(wait / 1000)}s: ${e.message}`);
      await sleep(wait);
    }
  }
  throw new Error('Giving up after repeated errors. Re-run the same command later; it resumes where it stopped.');
}

const constraint = abmcName => Buffer.from(`qs=[*],queryType=[16],library=[${LIBRARIES}]` + (abmcName ? `,cemetery=[${abmcName}]` : '')).toString('base64');

async function getPage(abmcName, start, max) {
  const json = await csw({ REQUEST: 'GetRecords', CONSTRAINTLANGUAGE: 'AWQL_FORM', CONSTRAINT: constraint(abmcName), ELEMENTSETNAME: 'full', RESULTTYPE: 'results', SORTBY: 'title:ASC', STARTPOSITION: String(start), MAXRECORDS: String(max) });
  const sr = json['csw:GetRecordsResponse']['csw:SearchResults'];
  return { total: Number(sr.numberOfRecordsMatched) || 0, rows: [].concat(sr.iStoreRecord || []), facets: sr.facetFields || [] };
}
async function getDetail(id) {
  const json = await csw({ REQUEST: 'GetRecordById', ELEMENTSETNAME: 'full', id: String(id) });
  return json['csw:GetRecordByIdResponse'] && json['csw:GetRecordByIdResponse'].iStoreRecord;
}

// Fields that are search-engine plumbing, not part of the soldier's record.
const DROP = ['aw_search_query', 'aw_rank', 'aw_library_id', 'document_path', 'product_size', 'access_level', 'level_code', 'browse1', 'browse2', 'browse3', 'browse4', 'browse5', 'browse6'];
const slim = r => Object.fromEntries(Object.entries(r).filter(([k]) => !DROP.includes(k)));

// ── probe ───────────────────────────────────────────────────────────────────
async function probe() {
  const { total, rows, facets } = await getPage(null, 1, 1);
  console.log(`Records in the ABMC burial search: ${total.toLocaleString()}`);
  const cem = facets.find(f => f.name === 'cemetery');
  for (const v of [].concat(cem ? cem.value : [])) {
    const m = String(v).match(/^(.*)\[(\d+)\]$/); if (!m) continue;
    const known = ABMC_CEMETERIES[m[1]];
    console.log(`  ${(known ? known.slug : '?? not mapped').padEnd(22)} ${m[2].padStart(6)}  ${m[1]}`);
  }
  await pause();
  if (rows[0]) console.log('\nFirst record, full detail:\n' + JSON.stringify(slim(await getDetail(rows[0].id)), null, 2));
  console.log('\nAny cemetery marked "?? not mapped" needs adding to ABMC_CEMETERIES before convert.');
}

// ── list ────────────────────────────────────────────────────────────────────
async function list() {
  fs.mkdirSync(path.join(DATA, 'list'), { recursive: true });
  const statePath = path.join(DATA, 'list-state.json');
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
  for (const name of selectedSources()) {
    const st = state[name] || { start: 1, count: 0, total: null, done: false };
    if (st.done) { console.log(`${name}: done (${st.count.toLocaleString()})`); continue; }
    const out = fs.createWriteStream(path.join(DATA, 'list', fileKey(name) + '.ndjson'), { flags: 'a' });
    while (true) {
      const { total, rows } = await getPage(name, st.start, PAGE_SIZE);
      rows.forEach(r => out.write(JSON.stringify(slim(r)) + '\n'));
      st.total = total; st.count += rows.length; st.start += rows.length;
      if (!rows.length || st.start > total) st.done = true;
      state[name] = st; fs.writeFileSync(statePath, JSON.stringify(state, null, 1));
      process.stdout.write(`\r${name}: ${st.count.toLocaleString()} / ${total.toLocaleString()}`);
      if (st.done) break;
      await pause();
    }
    await new Promise(r => out.end(r)); console.log('');
    await pause();
  }
  console.log(`List done (${requestsMade} requests). Retrieved ${new Date().toISOString().slice(0, 10)}.`);
}

// ── details ─────────────────────────────────────────────────────────────────
async function* lines(file) { if (!fs.existsSync(file)) return; const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity }); for await (const l of rl) if (l.trim()) yield l; }

async function details() {
  const max = Number(arg('--limit')) || Infinity;
  fs.mkdirSync(path.join(DATA, 'details'), { recursive: true });
  let fetched = 0;
  for (const name of selectedSources()) {
    const listFile = path.join(DATA, 'list', fileKey(name) + '.ndjson');
    if (!fs.existsSync(listFile)) { console.log(`${name}: no list yet, run "list" first`); continue; }
    const detFile = path.join(DATA, 'details', fileKey(name) + '.ndjson');
    const have = new Set();
    for await (const l of lines(detFile)) have.add(String(JSON.parse(l).id));
    const ids = [];
    for await (const l of lines(listFile)) { const id = String(JSON.parse(l).id); if (!have.has(id)) ids.push(id); }
    const totalIds = have.size + ids.length;
    console.log(`${name}: ${have.size.toLocaleString()} of ${totalIds.toLocaleString()} already fetched`);
    const out = fs.createWriteStream(detFile, { flags: 'a' });
    for (const id of ids) {
      if (fetched >= max) break;
      const d = await getDetail(id);
      if (d) out.write(JSON.stringify(slim(d)) + '\n');
      fetched++; have.add(id);
      process.stdout.write(`\r${name}: ${have.size.toLocaleString()} / ${totalIds.toLocaleString()}`);
      await pause();
    }
    await new Promise(r => out.end(r)); console.log('');
    if (fetched >= max) break;
  }
  console.log(`Fetched ${fetched.toLocaleString()} detail records this run.`);
}

// ── convert ─────────────────────────────────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function date(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return { text: '', year: null };
  return { text: `${MONTHS[+m[1] - 1]} ${+m[2]}, ${m[3]}`, year: +m[3] };
}
const WARS = { WWI: 'World War I', WWII: 'World War II', 'Korean War': 'Korean War', 'Vietnam War': 'Vietnam War' };
const clean = s => { const t = String(s == null ? '' : s).trim(); return /^(n\/a|none|unknown|0)$/i.test(t) ? '' : t; };
const appName = abmcName => (ABMC_CEMETERIES[abmcName] && ABMC_CEMETERIES[abmcName].name) || abmcName;

export function toMemorial(r, retrieved) {
  const id = clean(r.id);
  const abmcName = clean(r.cemetery);
  const src = ABMC_CEMETERIES[abmcName];
  if (!id || !src) return null;
  const given = clean(r.first_name), middle = clean(r.middle_name), surname = clean(r.title), suffix = clean(r.suffix);
  const plot = clean(r.plot), row = clean(r.row), grave = clean(r.grave);
  const hasDetail = 'plot' in r || 'death_date' in r;
  const missing = MISSING_ONLY.has(src.slug) || (hasDetail && !plot && !grave);
  const location = plot || row || grave
    ? [plot && `Plot ${plot}`, row && `Row ${row}`, grave && `Grave ${grave}`].filter(Boolean).join(' · ')
    : missing ? 'Tablets of the Missing' : '';
  const dod = date(r.death_date);
  const fullName = [given, middle, surname, suffix].filter(Boolean).join(' ');
  const awards = clean(r.awards) ? r.awards.split(/\s*;\s*/).filter(Boolean) : [];
  const m = {
    id: `${ID_PREFIX}-${id}`,
    fullName, givenName: given, middleName: middle, surname, suffix,
    surnameKey: surname.toUpperCase().replace(/[^A-Z]/g, ''),
    rank: clean(r.military_rank), rankAbbr: '', branch: clean(r.branch),
    unit: [clean(r.unit), clean(r.division)].filter((v, i, a) => v && a.indexOf(v) === i).join(', '),
    serviceNumber: clean(r.service_number), enteredFrom: clean(r.entry_state),
    deathDate: dod.text, deathYear: dod.year,
    conflict: WARS[clean(r.war)] || clean(r.war),
    cemetery: appName(abmcName), cemeteryKey: src.slug,
    section: plot, row, site: grave, location, missing,
    awards,
    record: { source: 'ABMC · Burial search record', externalId: id, url: SITE + '/s?q=' + encodeURIComponent(surname) + '&v=G', status: 'linked' },
    officialCitation: `American Battle Monuments Commission burial record ${id}${clean(r.service_number) ? ` (service number ${clean(r.service_number)})` : ''}, retrieved ${retrieved} from weremember.abmc.gov. Source: American Battle Monuments Commission.`,
    importedFrom: 'abmc', importedAt: retrieved
  };
  if (!hasDetail) { for (const k of ['deathDate', 'deathYear', 'section', 'row', 'site', 'location', 'missing', 'awards']) delete m[k]; }
  m.searchName = [m.fullName, m.givenName, m.middleName, m.surname, m.unit, m.serviceNumber, m.location, m.id].filter(Boolean).join(' ').toLowerCase();
  return m;
}

async function convert() {
  const retrieved = new Date().toISOString().slice(0, 10);
  const out = fs.createWriteStream(path.join(DATA, 'memorials.ndjson'));
  let n = 0, withDetail = 0, skipped = 0;
  for (const name of selectedSources()) {
    const detail = new Map();
    for await (const l of lines(path.join(DATA, 'details', fileKey(name) + '.ndjson'))) { const d = JSON.parse(l); detail.set(String(d.id), d); }
    const seen = new Set();
    for await (const l of lines(path.join(DATA, 'list', fileKey(name) + '.ndjson'))) {
      const r = JSON.parse(l), d = detail.get(String(r.id));
      const m = toMemorial(d ? { ...r, ...d } : r, retrieved);
      if (!m || seen.has(m.id)) { skipped++; continue; }
      seen.add(m.id); out.write(JSON.stringify(m) + '\n'); n++; if (d) withDetail++;
    }
  }
  await new Promise(r => out.end(r));
  console.log(`Converted ${n.toLocaleString()} memorials (${withDetail.toLocaleString()} with grave details; ${skipped} skipped) → data/abmc/memorials.ndjson`);
  if (withDetail < n) console.log('Records without details have no plot/row/grave or date of death yet. Run "details" and convert again to fill them in.');
}

// ── upload ──────────────────────────────────────────────────────────────────
async function upload() {
  const max = Number(arg('--limit')) || Infinity;
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
  console.log(`\nDone. ${written.toLocaleString()} written this run. Delete data/abmc/upload-state.json before uploading a new convert.`);
}

const cmd = process.argv[2];
const run = { probe, list, details, convert, upload }[cmd];
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('import-abmc.mjs')) {
  if (!run) { console.log('Usage: node import-abmc.mjs probe | list | details | convert | upload  [--cemetery normandy,brittany|all] [--limit N]'); process.exit(1); }
  run().then(closeSession, async e => { console.error('\n' + e.message); await closeSession(); process.exit(1); });
}
