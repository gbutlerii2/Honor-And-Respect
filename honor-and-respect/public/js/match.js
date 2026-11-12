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

// Letters OCR often swaps on carved stone (C/G, O/Q/0, I/L/1, S/5, B/8) fold to one form for fuzzy compares.
const FOLD = { G: 'C', Q: 'O', '0': 'O', L: 'I', '1': 'I', '5': 'S', '8': 'B' };
const fold = w => w.replace(/[GQ0L158]/g, c => FOLD[c]);
// A stray mark can split a word ("PEREC.ORY"): also try each pair of neighbouring pieces joined.
function withJoins(toks) {
  const out = [...toks];
  for (let i = 0; i + 1 < toks.length; i++) if (/^[A-Z]+$/.test(toks[i] + toks[i + 1])) out.push(toks[i] + toks[i + 1]);
  return out;
}

// opts.nameOnly: the text is engraved names (a memorial wall, tablets of the missing), not a
// headstone, so only name fields count. See rankNames.
export function rankCandidates(text, memorials, limit = 5, opts = {}) {
  if (opts.nameOnly) return rankNames(text, memorials, limit);
  const T = norm(text);
  const toks = T.split(' ').filter(Boolean);
  const set = new Set(toks);
  const fuzzy = withJoins(toks).filter(t => t.length >= 3).map(fold);
  const has = w => !!w && set.has(w);
  const near = w => { if (w.length < 4) return false; const f = fold(w); return fuzzy.some(t => Math.abs(t.length - f.length) <= 2 && lev(t, f) <= (f.length > 6 ? 2 : 1)); };
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

// Name-only matching for memorial walls. A wall photo holds many names on each line, separated by
// dots or crosses ("RICHARD A CROCKER · TURNER C JOHNSON + DENNIS S PIKE"), so the text is cut
// into one piece per name and each record is scored against its best piece. That stops a first
// name from one person and a surname from the next adding up to a false match.
// Scores: surname 64 (similar 40), + first name 93, + middle initial 99.
export function nameSegments(text) {
  return String(text || '').split(/\n|[·•+*|\/]|\s[-–—=~:;]+\s|\s[-–—]|[-–—]\s/).map(norm).filter(t => /[A-Z]{2}/.test(t));
}
function rankNames(text, memorials, limit) {
  const segs = nameSegments(text).map(T => {
    const toks = T.split(' ').filter(Boolean);
    return { set: new Set(toks), fuzzy: withJoins(toks).filter(t => t.length >= 3).map(fold) };
  });
  if (!segs.length) return [];
  const near = (seg, w) => { if (w.length < 4) return false; const f = fold(w); return seg.fuzzy.some(t => Math.abs(t.length - f.length) <= 2 && lev(t, f) <= (f.length > 6 ? 2 : 1)); };
  return memorials.map(m => {
    const sur = norm(m.surname).replace(/ /g, ''), giv = norm(m.givenName).split(' ')[0] || '', mid = norm(m.middleName);
    let best = { m, score: 0, fields: [] };
    if (!sur) return best;
    for (const seg of segs) {
      let s = 0; const f = [];
      if (seg.set.has(sur)) { s += 40; f.push(['Surname', 1]); }
      else if (near(seg, sur)) { s += 25; f.push(['Surname (similar)', 1]); }
      else continue;
      if (giv) { if (seg.set.has(giv) || near(seg, giv)) { s += 18; f.push(['First name', 1]); } else f.push(['First name', 0]); }
      if (mid) { if (seg.set.has(mid[0]) || seg.set.has(mid)) { s += 4; f.push(['Middle initial', 1]); } else f.push(['Middle initial', 0]); }
      const score = Math.min(99, Math.round(s * 99 / 62));
      if (score > best.score) best = { m, score, fields: f };
    }
    return best;
  }).filter(x => x.score >= 20).sort((a, b) => b.score - a.score).slice(0, limit);
}

const STOP = new Set(['SGT', 'SSG', 'PVT', 'PFC', 'CPL', 'CPT', 'COL', 'GEN', 'ARMY', 'NAVY', 'USMC', 'USAF', 'USA', 'USN', 'INF', 'DIV', 'REGT', 'WORLD', 'WAR', 'HERE', 'RESTS', 'HONORED', 'GLORY', 'COMRADE', 'ARMS', 'KNOWN', 'BUT', 'GOD', 'THE', 'AND', 'BELOVED', 'WIFE', 'HUSBAND', 'SON', 'DAUGHTER', 'KOREA', 'VIETNAM', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUNE', 'JUL', 'JULY', 'AUG', 'SEP', 'SEPT', 'OCT', 'NOV', 'DEC', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER', 'LIEUTENANT', 'SERGEANT', 'PRIVATE', 'CORPORAL', 'CAPTAIN', 'MAJOR', 'COLONEL', 'GENERAL', 'FORCE', 'AIR', 'CORPS', 'MARINE', 'COAST', 'GUARD', 'STAR', 'BRONZE', 'SILVER', 'PURPLE', 'HEART', 'MEDAL']);
// Words on a headstone that could be a surname, most likely first.
export function ocrTokens(text, max = 10) {
  const all = norm(text).split(' ').filter(Boolean);
  const words = all.filter(w => /^[A-Z]{3,}$/.test(w) && !STOP.has(w));
  // Rejoin a word split by a stray mark when one piece is short, e.g. "PE REGORY" or "PEREC ORY".
  const joins = [];
  for (let i = 0; i + 1 < all.length; i++) {
    const a = all[i], b = all[i + 1], j = a + b;
    if (/^[A-Z]{5,}$/.test(j) && (a.length <= 3 || b.length <= 3) && !STOP.has(a) && !STOP.has(b)) joins.push(j);
  }
  return [...new Set([...words, ...joins])].slice(0, max);
}

export function guessSurname(text) {
  const words = norm(text).split(' ').filter(w => /^[A-Z]{3,}$/.test(w) && !['SGT', 'PVT', 'PFC', 'CPL', 'ARMY', 'NAVY', 'USMC', 'INF', 'DIV', 'WORLD', 'WAR', 'HERE', 'RESTS'].includes(w));
  return words.length ? words[Math.min(words.length - 1, 2)] : '';
}
