// Vietnam Veterans Memorial names from the National Archives DCAS Vietnam extract
// ("Vietnam Conflict Extract Data File, as of April 29, 2008", NAID 2240992, Use: Unrestricted).
// One pipe-delimited line per name on The Wall. Shared by Admin → Data & QR (import in the browser)
// and scripts/import-vietnam.mjs. Column 0 (service number, often an SSN) is never read.

export const DCAS_URL = 'https://catalog.archives.gov/medialz/electronic-records/rg-330/dcase/DCAS.VN.EXT08.DAT';
export const DCAS_PAGE = 'https://catalog.archives.gov/id/2240992';
const CEMETERY_KEY = 'vietnam-veterans-memorial';                 // must match js/cemeteries.js
const CEMETERY_NAME = 'Vietnam Veterans Memorial';
const SOURCE = 'National Archives, Vietnam Conflict Extract Data File (DCAS), as of April 29, 2008, NAID 2240992';

// Columns of the pipe-delimited file (0-based) that the app uses. Column 0 is the service number; it is skipped.
export const C = { name: 4, branch: 6, rank: 7, born: 11, sex: 12, city: 13, county: 14, state: 16, stateName: 17, province: 26, country: 30, unit: 31, died: 34, deathYear: 35, hostile: 42, casualtyType: 44, reason: 45, wall: 49 };

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

/** Converts the whole file's text into memorials, numbering any repeated ID (-2, -3). */
export function convertDCAS(text, retrieved) {
  const seen = new Map(), out = [];
  for (const l of String(text).split(/\r?\n/)) {
    if (!l.trim()) continue;
    const cols = l.split('|');
    if (cols.length < 50) continue;
    const m = toMemorial(cols, retrieved);
    if (!m) continue;
    const k = seen.get(m.id) || 0; seen.set(m.id, k + 1);
    if (k) m.id += '-' + (k + 1);
    out.push(m);
  }
  return out;
}
