// Data layer. Same interface for Firebase (live) and localStorage (demo mode).
import { SAMPLE, searchName, surnameKey } from './data.js';
import { ocrTokens } from './match.js';
const skey = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
const FILTER_KEYS = ['cemetery', 'conflict', 'branch', 'status'];

const clean = o => JSON.parse(JSON.stringify(o ?? null));
const ms = v => (v && v.toMillis ? v.toMillis() : (typeof v === 'number' ? v : 0));

// Status for a new remembrance, from the admin switches in settings/remembrances (mirrors firestore.rules).
const newRemembranceStatus = (cfg, u) => (u && ['editor', 'admin'].includes(u.role)) ? 'published' : cfg.requireEmailConfirmation ? 'unconfirmed' : cfg.requireApproval ? 'pending' : 'published';

export class LocalAPI {
  constructor() {
    this.k = 'har-demo-';
    this.demo = true;
    if (!localStorage.getItem(this.k + 'memorials')) this._set('memorials', SAMPLE);
    if (!localStorage.getItem(this.k + 'revisions')) this._set('revisions', [
      { id: 'r-seed-1', memorialId: 'NAC-D-14-22', summary: 'Corrected birthplace from “Bedford County” to “Bedford”, citing family letters.', changes: { birthplace: 'Bedford, Virginia' }, authorUid: 'k-osei', authorName: 'K. Osei', authorRole: 'contributor', status: 'pending', createdAt: Date.now() - 6 * 864e5 },
      { id: 'r-seed-2', memorialId: 'NAC-D-14-22', summary: 'Linked NARA enlistment record 20365118.', changes: {}, authorUid: 'j-pryor', authorName: 'J. Pryor', authorRole: 'editor', status: 'published', createdAt: Date.now() - 40 * 864e5 }
    ]);
  }
  _get(n, d) { try { return JSON.parse(localStorage.getItem(this.k + n)) ?? d; } catch { return d; } }
  _set(n, v) { localStorage.setItem(this.k + n, JSON.stringify(v)); }
  _rev(r) { const all = this._get('revisions', []); all.push({ ...r, id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now() }); this._set('revisions', all); }
  async listMemorials() { return this._get('memorials', []); }
  async search(f) {
    const k = skey(f.q);
    const list = (await this.listMemorials()).filter(m => (!k || surnameKey(m).startsWith(k)) && FILTER_KEYS.every(x => !f[x] || m[x] === f[x]))
      .sort((a, b) => surnameKey(a).localeCompare(surnameKey(b)) || (a.givenName || '').localeCompare(b.givenName || ''));
    return { items: list.slice(0, f.limit || 50) };
  }
  async candidates() { return this.listMemorials(); }
  async getMany(ids) { const all = await this.listMemorials(); return ids.map(id => all.find(m => m.id === id)).filter(Boolean); }
  async page({ q, status, cemetery, cursor, limit }) {
    const k = skey(q);
    const list = (await this.listMemorials()).filter(m => (!k || surnameKey(m).startsWith(k)) && (!status || m.status === status) && (!cemetery || m.cemetery === cemetery)).sort((a, b) => a.id.localeCompare(b.id));
    const start = cursor || 0;
    return { items: list.slice(start, start + limit), last: start + limit };
  }
  async count() { return (await this.listMemorials()).length; }
  async getMemorial(id) { return (await this.listMemorials()).find(m => m.id === id) || null; }
  async saveMemorial(id, data, summary, u) {
    const all = await this.listMemorials();
    const i = all.findIndex(m => m.id === id);
    const rec = { ...(all[i] || {}), ...clean(data), id, updatedAt: Date.now(), updatedBy: u.uid };
    rec.searchName = searchName(rec);
    if (i >= 0) all[i] = rec; else all.push(rec);
    this._set('memorials', all);
    this._rev({ memorialId: id, summary, changes: clean(data), authorUid: u.uid, authorName: u.name, authorRole: u.role, status: 'published' });
  }
  async suggest(id, changes, summary, u) { this._rev({ memorialId: id, summary, changes: clean(changes), authorUid: u.uid, authorName: u.name, authorRole: u.role, status: 'pending' }); }
  async revisions(id) { return this._get('revisions', []).filter(r => r.memorialId === id).sort((a, b) => b.createdAt - a.createdAt); }
  async pending() { return this._get('revisions', []).filter(r => r.status === 'pending').sort((a, b) => b.createdAt - a.createdAt); }
  async review(rev, approve, u) {
    if (approve) {
      const all = await this.listMemorials();
      const i = all.findIndex(m => m.id === rev.memorialId);
      if (i >= 0) { all[i] = { ...all[i], ...rev.changes, updatedAt: Date.now(), updatedBy: u.uid }; this._set('memorials', all); }
    }
    const revs = this._get('revisions', []);
    const j = revs.findIndex(r => r.id === rev.id);
    if (j >= 0) { revs[j] = { ...revs[j], status: approve ? 'published' : 'rejected', reviewedBy: u.uid, reviewedAt: Date.now() }; this._set('revisions', revs); }
  }
  async deleteMemorial(id) { this._set('memorials', (await this.listMemorials()).filter(m => m.id !== id)); }
  async rebuildKeys() { const all = await this.listMemorials(); return { seen: all.length, fixed: 0 }; }
  async removeSample() { const all = await this.listMemorials(); const keep = all.filter(m => !m.sample); this._set('memorials', keep); return all.length - keep.length; }
  async createUser({ email, name, role }) { const us = this._get('extraUsers', []); if (us.some(u => u.email === email)) throw new Error('That user already exists'); us.push({ uid: 'u' + Date.now(), email, displayName: name || '', role }); this._set('extraUsers', us); }
  async users() { const extra = this._get('extraUsers', []); return (await this._users()).concat(extra); }
  async _users() { const u = this._get('user', null); return [{ uid: 'demo', email: u?.email || 'demo@example.org', displayName: u?.name || 'Demo user', role: u?.role || 'contributor', requestedRole: u?.requestedRole || '' }, { uid: 'k-osei', email: 'k.osei@example.org', displayName: 'K. Osei', role: 'contributor', requestedRole: 'editor', requestReason: 'Unit association historian, 116th Infantry.' }]; }
  async setRole(uid, role) { const ex = this._get('extraUsers', []); const e = ex.find(x => x.uid === uid); if (e) { e.role = role; this._set('extraUsers', ex); } if (uid === 'demo') { const u = this._get('user', {}); this._set('user', { ...u, role }); } }
  async requestRole(uid, data) { const u = this._get('user', {}); this._set('user', { ...u, requestedRole: 'editor', ...data }); }
  async seed(records) { const all = await this.listMemorials(); const byId = Object.fromEntries(all.map(m => [m.id, m])); records.forEach(r => { byId[r.id] = { ...(byId[r.id] || {}), ...clean(r), searchName: searchName(r) }; }); this._set('memorials', Object.values(byId)); return records.length; }
  async markQR() { }
  // remembrances & stories (email kept apart from the public post)
  async remembranceSettings() { return { requireApproval: false, requireEmailConfirmation: false, ...this._get('settings-remembrances', {}) }; }
  async setRemembranceSettings(v) { this._set('settings-remembrances', { ...(await this.remembranceSettings()), ...v }); }
  async remembrances(memorialId, all) { return this._get('remembrances', []).filter(r => r.memorialId === memorialId && (all || r.status === 'published')).sort((a, b) => b.createdAt - a.createdAt); }
  async addRemembrance(memorialId, { name, relationship, body, email }, u) {
    const status = newRemembranceStatus(await this.remembranceSettings(), u);
    const id = 'rm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const list = this._get('remembrances', []); list.push({ id, memorialId, name, relationship, body, status, createdAt: Date.now() }); this._set('remembrances', list);
    const c = this._get('remembranceContacts', {}); c[id] = { email, memorialId, createdAt: Date.now() }; this._set('remembranceContacts', c);
    // Demo mode sends no email; the app offers the confirmation link on screen instead.
    const token = status === 'unconfirmed' ? 'demo' + Math.random().toString(36).slice(2, 12) + 'xxxxxxxxxxxx' : '';
    if (token) { const t = this._get('remembranceTokens', {}); t[id] = token; this._set('remembranceTokens', t); }
    this._log(token ? 'remembrance.submitted' : 'remembrance.posted', `${name} ${token ? 'submitted' : 'posted'} a remembrance on ${memorialId}${token ? '; confirmation email sent' : status === 'pending' ? ' (awaiting approval)' : ''}`, { actorName: name, actorUid: u ? u.uid : 'system', memorialId, targetId: id });
    return { id, status, demoToken: token };
  }
  async confirmRemembrance(id, token) {
    const t = this._get('remembranceTokens', {}); const list = this._get('remembrances', []); const r = list.find(x => x.id === id);
    if (!r || !t[id]) throw Object.assign(new Error('This remembrance could not be found. It may have expired or been removed.'), { code: 'functions/not-found' });
    if (t[id] !== token) throw Object.assign(new Error('This confirmation link is not valid.'), { code: 'functions/permission-denied' });
    if (r.status !== 'unconfirmed') return { status: r.status, memorialId: r.memorialId, already: true };
    r.status = (await this.remembranceSettings()).requireApproval ? 'pending' : 'published'; this._set('remembrances', list);
    this._log('remembrance.confirmed', `${r.name} confirmed their remembrance${r.status === 'pending' ? ' (awaiting approval)' : ' (now public)'}`, { actorName: r.name, actorUid: 'system', memorialId: r.memorialId, targetId: id });
    return { status: r.status, memorialId: r.memorialId };
  }
  // activity log
  _log(type, summary, extra = {}) { const all = this._get('activity', []); all.push({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, summary: String(summary).slice(0, 500), at: Date.now(), ...extra }); this._set('activity', all.slice(-2000)); }
  async log(type, summary, extra = {}) { const u = this.currentUser(); this._log(type, summary, { actorUid: u ? u.uid : 'system', actorName: u ? u.name : 'Unknown', ...extra }); }
  async activity({ from, to, limit = 500 }) { return this._get('activity', []).filter(a => a.at >= from && a.at < to).sort((a, b) => b.at - a.at).slice(0, limit); }
  async remembranceQueue() { return this._get('remembrances', []).sort((a, b) => b.createdAt - a.createdAt).slice(0, 200); }
  async remembranceEmails(ids) { const c = this._get('remembranceContacts', {}); return Object.fromEntries(ids.map(id => [id, c[id] ? c[id].email : ''])); }
  async moderateRemembrance(id, status, u) { const list = this._get('remembrances', []); const r = list.find(x => x.id === id); if (r) { Object.assign(r, { status, moderatedBy: u.uid, moderatedAt: Date.now() }); this._set('remembrances', list); } }
  async deleteRemembrance(id) { this._set('remembrances', this._get('remembrances', []).filter(r => r.id !== id)); const c = this._get('remembranceContacts', {}); delete c[id]; this._set('remembranceContacts', c); }
  // demo auth
  currentUser() { return this._get('user', null); }
  signIn(email, name, forceRole) { const u = { uid: 'demo', email, name: name || email.split('@')[0], role: forceRole || this._get('user', {})?.role || 'contributor' }; this._set('user', u); return u; }
  signOut() { localStorage.removeItem(this.k + 'user'); }
  setDemoRole(role) { const u = this._get('user', null) || this.signIn('demo@example.org', 'Demo user'); this._set('user', { ...u, role }); }
  resetDemo() { ['memorials', 'revisions'].forEach(n => localStorage.removeItem(this.k + n)); }
}

export async function makeFireAPI(config, { recaptchaSiteKey = '' } = {}) {
  const V = '10.12.2', B = `https://www.gstatic.com/firebasejs/${V}/`;
  const [{ initializeApp, deleteApp }, fs, au] = await Promise.all([import(B + 'firebase-app.js'), import(B + 'firebase-firestore.js'), import(B + 'firebase-auth.js')]);
  const app = initializeApp(config);
  // App Check proves requests come from this website, not a bot calling Firestore directly.
  if (recaptchaSiteKey) {
    try {
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // prints a debug token to register in the console
      const ac = await import(B + 'firebase-app-check.js');
      ac.initializeAppCheck(app, { provider: new ac.ReCaptchaV3Provider(recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
    } catch (e) { console.warn('App Check could not start', e); }
  }
  const db = fs.getFirestore(app);
  const auth = au.getAuth(app);
  const M = () => fs.collection(db, 'memorials');
  const R = () => fs.collection(db, 'revisions');
  let cache = null;
  const stamp = r => ({ ...r, createdAt: ms(r.createdAt) || Date.now() });
  return {
    demo: false, auth, au,
    async listMemorials(force) { if (cache && !force) return cache; const s = await fs.getDocs(M()); cache = s.docs.map(d => ({ id: d.id, ...d.data() })); return cache; },
    // Surname-prefix search with optional equality filters (indexes in firestore.indexes.json).
    async search(f) {
      const cons = [];
      FILTER_KEYS.forEach(x => { if (f[x]) cons.push(fs.where(x, '==', f[x])); });
      const k = skey(f.q);
      if (k) cons.push(fs.where('surnameKey', '>=', k), fs.where('surnameKey', '<=', k + '\uf8ff'));
      cons.push(fs.orderBy('surnameKey'), fs.limit(f.limit || 50));
      const s = await fs.getDocs(fs.query(M(), ...cons));
      return { items: s.docs.map(d => ({ id: d.id, ...d.data() })) };
    },
    // Pull only records whose surname matches words read from the stone.
    async candidates(text) {
      this._tok = this._tok || new Map();
      const out = new Map();
      for (const t of ocrTokens(text)) {
        if (!this._tok.has(t)) {
          const exact = fs.getDocs(fs.query(M(), fs.where('surnameKey', '==', t), fs.limit(500)));
          // Prefix search for misreads; a first letter OCR often swaps (C/G, O/Q) is tried both ways.
          const p = t.slice(0, 4), alt = { C: 'G', G: 'C', O: 'Q', Q: 'O' }[p[0]];
          const pre = q => fs.getDocs(fs.query(M(), fs.where('surnameKey', '>=', q), fs.where('surnameKey', '<=', q + '\uf8ff'), fs.orderBy('surnameKey'), fs.limit(150)));
          const near = t.length >= 5 ? [pre(p), ...(alt ? [pre(alt + p.slice(1))] : [])] : [];
          const res = await Promise.all([exact, ...near]);
          this._tok.set(t, res.flatMap(r => r.docs).map(d => ({ id: d.id, ...d.data() })));
        }
        this._tok.get(t).forEach(m => out.set(m.id, m));
      }
      return [...out.values()];
    },
    async getMany(ids) { return (await Promise.all(ids.map(id => this.getMemorial(id).catch(() => null)))).filter(Boolean); },
    async page({ q, status, cemetery, cursor, limit }) {
      const cons = [];
      if (cemetery) cons.push(fs.where('cemetery', '==', cemetery));
      if (status) cons.push(fs.where('status', '==', status));
      const k = skey(q);
      if (k) cons.push(fs.where('surnameKey', '>=', k), fs.where('surnameKey', '<=', k + '\uf8ff'), fs.orderBy('surnameKey'));
      else cons.push(fs.orderBy(fs.documentId()));
      if (cursor) cons.push(fs.startAfter(cursor));
      cons.push(fs.limit(limit));
      const s = await fs.getDocs(fs.query(M(), ...cons));
      return { items: s.docs.map(d => ({ id: d.id, ...d.data() })), last: s.docs[s.docs.length - 1] || null };
    },
    async count() { const c = await fs.getCountFromServer(M()); return c.data().count; },
    async getMemorial(id) { const c = cache && cache.find(m => m.id === id); if (c) return c; const d = await fs.getDoc(fs.doc(db, 'memorials', id)); return d.exists() ? { id: d.id, ...d.data() } : null; },
    async saveMemorial(id, data, summary, u) {
      const d = clean(data); delete d.id;
      const prev = (cache && cache.find(m => m.id === id)) || {};
      d.searchName = searchName({ ...prev, ...d, id });
      if ('surname' in d || !prev.surnameKey) d.surnameKey = surnameKey({ ...prev, ...d });
      await fs.setDoc(fs.doc(db, 'memorials', id), { ...d, updatedAt: fs.serverTimestamp(), updatedBy: u.uid }, { merge: true });
      await fs.addDoc(R(), { memorialId: id, summary, changes: clean(data), authorUid: u.uid, authorName: u.name, authorRole: u.role, status: 'published', createdAt: fs.serverTimestamp() });
      cache = null;
    },
    async suggest(id, changes, summary, u) { await fs.addDoc(R(), { memorialId: id, summary, changes: clean(changes), authorUid: u.uid, authorName: u.name, authorRole: u.role, status: 'pending', createdAt: fs.serverTimestamp() }); },
    async revisions(id) { const s = await fs.getDocs(fs.query(R(), fs.where('memorialId', '==', id))); return s.docs.map(d => stamp({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt); },
    async pending() { const s = await fs.getDocs(fs.query(R(), fs.where('status', '==', 'pending'))); return s.docs.map(d => stamp({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt); },
    async review(rev, approve, u) {
      if (approve) { const ch = clean(rev.changes); if ('surname' in ch) ch.surnameKey = surnameKey(ch); await fs.setDoc(fs.doc(db, 'memorials', rev.memorialId), { ...ch, updatedAt: fs.serverTimestamp(), updatedBy: u.uid }, { merge: true }); }
      await fs.updateDoc(fs.doc(db, 'revisions', rev.id), { status: approve ? 'published' : 'rejected', reviewedBy: u.uid, reviewedAt: fs.serverTimestamp() });
      cache = null;
    },
    async deleteMemorial(id) { await fs.deleteDoc(fs.doc(db, 'memorials', id)); cache = null; },
    async ensureProfile(user, ownerEmail) {
      const ref = fs.doc(db, 'users', user.uid);
      const owner = !!ownerEmail && (user.email || '').toLowerCase() === ownerEmail.toLowerCase();
      const d = await fs.getDoc(ref);
      if (d.exists()) {
        const data = d.data();
        if (owner && data.role !== 'admin') { await fs.updateDoc(ref, { role: 'admin' }); data.role = 'admin'; }
        return data;
      }
      const p = { email: user.email || '', displayName: user.displayName || (owner ? 'gbutlerii' : ''), role: owner ? 'admin' : 'contributor', createdAt: fs.serverTimestamp() };
      await fs.setDoc(ref, p);
      return p;
    },
    // Adds surnameKey/searchName to records saved before those fields existed.
    async rebuildKeys(onProgress) {
      let last = null, fixed = 0, seen = 0;
      while (true) {
        const cons = [fs.orderBy(fs.documentId()), fs.limit(400)];
        if (last) cons.splice(1, 0, fs.startAfter(last));
        const s = await fs.getDocs(fs.query(M(), ...cons));
        if (s.empty) break;
        const b = fs.writeBatch(db); let n = 0;
        s.docs.forEach(d => { const m = d.data(); const k = surnameKey(m); const sn = searchName({ ...m, id: d.id }); if (m.surnameKey !== k || !m.searchName) { b.update(d.ref, { surnameKey: k, searchName: sn }); n++; } });
        if (n) await b.commit();
        fixed += n; seen += s.size; last = s.docs[s.docs.length - 1];
        if (onProgress) onProgress(seen, fixed);
        if (s.size < 400) break;
      }
      cache = null; return { seen, fixed };
    },
    async removeSample() {
      let n = 0;
      while (true) {
        const s = await fs.getDocs(fs.query(M(), fs.where('sample', '==', true), fs.limit(400)));
        if (s.empty) break;
        const b = fs.writeBatch(db); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); n += s.size;
      }
      cache = null; return n;
    },
    // Creates the account on a separate Firebase instance so the admin stays signed in.
    async createUser({ email, password, name, role }) {
      const sec = initializeApp(config, 'create-user-' + Date.now());
      try {
        const a2 = au.getAuth(sec);
        const c = await au.createUserWithEmailAndPassword(a2, email, password);
        if (name) await au.updateProfile(c.user, { displayName: name });
        await fs.setDoc(fs.doc(db, 'users', c.user.uid), { email, displayName: name || '', role, createdAt: fs.serverTimestamp(), createdBy: auth.currentUser ? auth.currentUser.uid : '' });
        await au.signOut(a2);
        return c.user.uid;
      } finally { await deleteApp(sec).catch(() => { }); }
    },
    async users() { const s = await fs.getDocs(fs.collection(db, 'users')); return s.docs.map(d => ({ uid: d.id, ...d.data() })); },
    async setRole(uid, role) { await fs.updateDoc(fs.doc(db, 'users', uid), { role }); },
    async requestRole(uid, data) { await fs.updateDoc(fs.doc(db, 'users', uid), { requestedRole: 'editor', requestReason: data.reason || '', affiliation: data.affiliation || '', requestedAt: fs.serverTimestamp() }); },
    async seed(records) {
      let n = 0;
      for (let i = 0; i < records.length; i += 400) {
        const b = fs.writeBatch(db);
        records.slice(i, i + 400).forEach(r => { const d = clean(r); const id = String(d.id); delete d.id; d.searchName = searchName({ ...d, id }); d.surnameKey = surnameKey(d); b.set(fs.doc(db, 'memorials', id), d, { merge: true }); n++; });
        await b.commit();
      }
      cache = null; return n;
    },
    // ---------- remembrances & stories ----------
    // The post (public once published) and the poster's email (editors/admins only) are written together.
    async remembranceSettings() { const d = await fs.getDoc(fs.doc(db, 'settings', 'remembrances')).catch(() => null); return { requireApproval: false, requireEmailConfirmation: false, ...(d && d.exists() ? d.data() : {}) }; },
    async setRemembranceSettings(v) { await fs.setDoc(fs.doc(db, 'settings', 'remembrances'), v, { merge: true }); },
    async remembrances(memorialId, all) {
      const cons = [fs.where('memorialId', '==', memorialId)];
      if (!all) cons.push(fs.where('status', '==', 'published'));
      const s = await fs.getDocs(fs.query(fs.collection(db, 'remembrances'), ...cons));
      return s.docs.map(d => stamp({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
    },
    async addRemembrance(memorialId, { name, relationship, body, email }, u) {
      const status = newRemembranceStatus(await this.remembranceSettings(), u);
      const ref = fs.doc(fs.collection(db, 'remembrances'));
      const b = fs.writeBatch(db);
      const post = { memorialId, name, body, status, createdAt: fs.serverTimestamp() };
      if (relationship) post.relationship = relationship;
      b.set(ref, post);
      b.set(fs.doc(db, 'remembranceContacts', ref.id), { email, memorialId, createdAt: fs.serverTimestamp() });
      // Logged in the same write (the confirmation Cloud Function logs unconfirmed posts).
      if (status !== 'unconfirmed') {
        const cu = auth.currentUser;
        b.set(fs.doc(fs.collection(db, 'activity')), { type: 'remembrance.posted', summary: `${name} posted a remembrance on ${memorialId}${status === 'pending' ? ' (awaiting approval)' : ''}`.slice(0, 500), actorUid: cu ? cu.uid : 'visitor', actorName: name, memorialId, targetId: ref.id, at: fs.serverTimestamp() });
      }
      await b.commit();
      return { id: ref.id, status };
    },
    // Called from the link in the confirmation email (Cloud Function confirmRemembrance).
    async confirmRemembrance(id, token) {
      const fn = await import(B + 'firebase-functions.js');
      const res = await fn.httpsCallable(fn.getFunctions(app), 'confirmRemembrance')({ id, token });
      return res.data;
    },
    // ---------- activity log ----------
    async log(type, summary, extra = {}) {
      const cu = auth.currentUser; if (!cu) return;
      await fs.addDoc(fs.collection(db, 'activity'), { type, summary: String(summary).slice(0, 500), actorName: extra.actorName || cu.displayName || cu.email || '', at: fs.serverTimestamp(), ...extra, actorUid: cu.uid });
    },
    async activity({ from, to, limit = 500 }) {
      const s = await fs.getDocs(fs.query(fs.collection(db, 'activity'), fs.where('at', '>=', fs.Timestamp.fromMillis(from)), fs.where('at', '<', fs.Timestamp.fromMillis(to)), fs.orderBy('at', 'desc'), fs.limit(limit)));
      return s.docs.map(d => { const a = d.data(); return { id: d.id, ...a, at: ms(a.at) }; });
    },
    async remembranceQueue() { const s = await fs.getDocs(fs.query(fs.collection(db, 'remembrances'), fs.orderBy('createdAt', 'desc'), fs.limit(200))); return s.docs.map(d => stamp({ id: d.id, ...d.data() })); },
    async remembranceEmails(ids) { const out = {}; await Promise.all(ids.map(async id => { const d = await fs.getDoc(fs.doc(db, 'remembranceContacts', id)).catch(() => null); out[id] = d && d.exists() ? d.data().email : ''; })); return out; },
    async moderateRemembrance(id, status, u) { await fs.updateDoc(fs.doc(db, 'remembrances', id), { status, moderatedBy: u.uid, moderatedAt: fs.serverTimestamp() }); },
    async deleteRemembrance(id) { const b = fs.writeBatch(db); b.delete(fs.doc(db, 'remembrances', id)); b.delete(fs.doc(db, 'remembranceContacts', id)); await b.commit(); },
    async markQR(ids, u, base) { const b = fs.writeBatch(db); ids.forEach(id => b.set(fs.doc(db, 'qrCodes', id), { memorialId: id, url: base + '/m/' + id, createdBy: u.uid, createdAt: fs.serverTimestamp() }, { merge: true })); await b.commit(); }
  };
}
