// Rank register entries against OCR text from a headstone photo.
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export function rankCandidates(text, memorials, limit = 5) {
  const T = norm(text);
  const toks = T.split(' ').filter(Boolean);
  const set = new Set(toks);
  const has = w => !!w && set.has(w);
  const near = w => w.length >= 4 && toks.some(t => t.length >= 3 && Math.abs(t.length - w.length) <= 2 && lev(t, w) <= (w.length > 6 ? 2 : 1));
  const unknownStone = T.includes('KNOWN BUT TO GOD');
  return memorials.map(m => {
    let s = 0; const f = [];
    const sur = norm(m.surname), giv = norm(m.givenName), mid = norm(m.middleName);
    if (!sur) {
      if (unknownStone) { s += 30; f.push(['Unknown burial', 1]); }
      return { m, score: s, fields: f };
    }
    if (has(sur)) { s += 40; f.push(['Surname', 1]); }
    else if (near(sur)) { s += 25; f.push(['Surname (similar)', 1]); }
    else f.push(['Surname', 0]);
    if (giv) { if (has(giv) || near(giv)) { s += 18; f.push(['First name', 1]); } else f.push(['First name', 0]); }
    if (mid) { if (has(mid[0]) || has(mid)) { s += 4; f.push(['Middle initial', 1]); } else f.push(['Middle initial', 0]); }
    if (m.deathYear) { if (has(String(m.deathYear))) { s += 14; f.push(['Year of death', 1]); } else f.push(['Year of death', 0]); }
    if (m.birthYear && has(String(m.birthYear))) { s += 6; f.push(['Year of birth', 1]); }
    const dd = norm(m.deathDate).split(' ');
    if (dd.length >= 3 && toks.some(t => t.length >= 3 && dd[0].startsWith(t.slice(0, 3))) && has(dd[1])) { s += 8; f.push(['Date', 1]); }
    const nums = norm(m.unit).match(/\d+/g) || [];
    if (nums.length) { if (nums.some(n => has(n))) { s += 8; f.push(['Unit', 1]); } else f.push(['Unit', 0]); }
    const st = norm(m.enteredFrom);
    if (st && T.includes(st)) { s += 4; f.push(['State', 1]); }
    const ra = norm(m.rankAbbr).replace(/ /g, '');
    if (ra && has(ra)) { s += 4; f.push(['Rank', 1]); }
    return { m, score: Math.min(99, s), fields: f };
  }).filter(x => x.score >= 20).sort((a, b) => b.score - a.score).slice(0, limit);
}

const STOP = new Set(['SGT', 'SSG', 'PVT', 'PFC', 'CPL', 'CPT', 'COL', 'GEN', 'ARMY', 'NAVY', 'USMC', 'USAF', 'USA', 'USN', 'INF', 'DIV', 'REGT', 'WORLD', 'WAR', 'HERE', 'RESTS', 'HONORED', 'GLORY', 'COMRADE', 'ARMS', 'KNOWN', 'BUT', 'GOD', 'THE', 'AND', 'BELOVED', 'WIFE', 'HUSBAND', 'SON', 'DAUGHTER', 'KOREA', 'VIETNAM', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUNE', 'JUL', 'JULY', 'AUG', 'SEP', 'SEPT', 'OCT', 'NOV', 'DEC', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER', 'LIEUTENANT', 'SERGEANT', 'PRIVATE', 'CORPORAL', 'CAPTAIN', 'MAJOR', 'COLONEL', 'GENERAL', 'FORCE', 'AIR', 'CORPS', 'MARINE', 'COAST', 'GUARD', 'STAR', 'BRONZE', 'SILVER', 'PURPLE', 'HEART', 'MEDAL']);
// Words on a headstone that could be a surname, most likely first.
export function ocrTokens(text, max = 8) {
  const words = norm(text).split(' ').filter(w => /^[A-Z]{3,}$/.test(w) && !STOP.has(w));
  return [...new Set(words)].slice(0, max);
}

export function guessSurname(text) {
  const words = norm(text).split(' ').filter(w => /^[A-Z]{3,}$/.test(w) && !['SGT', 'PVT', 'PFC', 'CPL', 'ARMY', 'NAVY', 'USMC', 'INF', 'DIV', 'WORLD', 'WAR', 'HERE', 'RESTS'].includes(w));
  return words.length ? words[Math.min(words.length - 1, 2)] : '';
}
