// Honor and Respect — Cloud Functions
// Remembrance email confirmation: a new public post is saved as "unconfirmed"
// (hidden). sendRemembranceConfirmation emails the poster a one-time link;
// confirmRemembrance publishes the post when they open it. Unconfirmed posts
// are deleted after 14 days. Every step is written to the admin activity log.
//
// One-time setup (see README → "Remembrances & stories"):
//   firebase functions:secrets:set SMTP_URI   e.g. smtps://apikey:SG.xxxx@smtp.sendgrid.net:465
//   firebase deploy --only functions,firestore
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';

initializeApp();
const db = getFirestore();

const SMTP_URI = defineSecret('SMTP_URI');
const SITE_URL = defineString('SITE_URL', { default: 'https://honor-and-respect.com' });
const MAIL_FROM = defineString('MAIL_FROM', { default: 'Honor and Respect <noreply@honor-and-respect.com>' });

const TOKEN_DAYS = 7;          // confirmation link lifetime
const CLEANUP_DAYS = 14;       // unconfirmed posts are removed after this
const MAX_PER_EMAIL_HOUR = 5;  // stops one address being used to flood inboxes

const sha = s => createHash('sha256').update(String(s)).digest('hex');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = m => (m && (m.fullName || [m.givenName, m.middleName, m.surname].filter(Boolean).join(' '))) || 'this memorial';

function log(type, summary, extra = {}) {
  return db.collection('activity').add({ type, summary: String(summary).slice(0, 500), actorUid: 'system', actorName: extra.actorName || 'Website visitor', at: FieldValue.serverTimestamp(), ...extra })
    .catch(e => logger.warn('activity log failed', e));
}

export const sendRemembranceConfirmation = onDocumentCreated({ document: 'remembrances/{rid}', secrets: [SMTP_URI] }, async event => {
  const rid = event.params.rid;
  const post = event.data && event.data.data();
  if (!post) return;
  const memSnap = await db.doc(`memorials/${post.memorialId}`).get();
  const memName = nameOf(memSnap.data());
  if (post.status !== 'unconfirmed') {
    // Posted directly by a signed-in editor or admin.
    return log('remembrance.posted', `${post.name} posted a remembrance on ${memName}`, { actorName: post.name, memorialId: post.memorialId, targetId: rid });
  }
  const contact = await db.doc(`remembranceContacts/${rid}`).get();
  const email = contact.exists ? String(contact.data().email || '').trim() : '';
  if (!email) return log('remembrance.error', `No email on file for a remembrance on ${memName}`, { memorialId: post.memorialId, targetId: rid });

  const emailHash = sha(email.toLowerCase());
  const hourAgo = Timestamp.fromMillis(Date.now() - 3600e3);
  const recent = await db.collection('remembranceTokens').where('emailHash', '==', emailHash).where('createdAt', '>=', hourAgo).count().get();
  if (recent.data().count >= MAX_PER_EMAIL_HOUR) {
    return log('remembrance.throttled', `Confirmation email not sent (too many posts from one address in an hour) for ${memName}`, { actorName: post.name, memorialId: post.memorialId, targetId: rid });
  }

  const token = randomBytes(24).toString('base64url');
  await db.doc(`remembranceTokens/${rid}`).set({ hash: sha(token), emailHash, memorialId: post.memorialId, createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + TOKEN_DAYS * 864e5), usedAt: null });

  const link = `${SITE_URL.value().replace(/\/$/, '')}/#/confirm/${encodeURIComponent(rid)}/${token}`;
  const excerpt = post.body.length > 400 ? post.body.slice(0, 400) + '…' : post.body;
  try {
    await nodemailer.createTransport(SMTP_URI.value()).sendMail({
      from: MAIL_FROM.value(),
      to: email,
      subject: `Confirm your remembrance of ${memName}`,
      text: `Thank you for leaving a remembrance of ${memName} on Honor and Respect.\n\nTo publish it, open this link within ${TOKEN_DAYS} days:\n${link}\n\nYour remembrance:\n"${excerpt}"\n\nIf you didn't write this, ignore this email and it will be removed. Your email address is never shown publicly.`,
      html: `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#222;line-height:1.5">
        <p>Thank you for leaving a remembrance of <strong>${esc(memName)}</strong> on Honor and Respect.</p>
        <p><a href="${esc(link)}" style="display:inline-block;padding:12px 20px;border:1px solid #7a5c1e;border-radius:4px;color:#7a5c1e;text-decoration:none">Confirm and publish</a></p>
        <p style="font-size:13px;color:#555">The link works for ${TOKEN_DAYS} days.</p>
        <blockquote style="margin:16px 0;padding:8px 14px;border-left:3px solid #ccc;color:#444;white-space:pre-line">${esc(excerpt)}</blockquote>
        <p style="font-size:13px;color:#555">If you didn't write this, ignore this email and it will be removed. Your email address is never shown publicly.</p></div>`
    });
    await log('remembrance.submitted', `${post.name} submitted a remembrance on ${memName}; confirmation email sent`, { actorName: post.name, memorialId: post.memorialId, targetId: rid });
  } catch (e) {
    logger.error('confirmation email failed', e);
    await log('remembrance.error', `Could not send the confirmation email for ${post.name}'s remembrance on ${memName}: ${e.message}`, { actorName: post.name, memorialId: post.memorialId, targetId: rid });
  }
});

export const confirmRemembrance = onCall(async req => {
  const id = String((req.data && req.data.id) || '');
  const token = String((req.data && req.data.token) || '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(id) || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new HttpsError('invalid-argument', 'This confirmation link is not valid.');
  const tokRef = db.doc(`remembranceTokens/${id}`), postRef = db.doc(`remembrances/${id}`);
  return db.runTransaction(async tx => {
    const [tok, post, cfg] = await Promise.all([tx.get(tokRef), tx.get(postRef), tx.get(db.doc('settings/remembrances'))]);
    if (!tok.exists || !post.exists) throw new HttpsError('not-found', 'This remembrance could not be found. It may have expired or been removed.');
    const t = tok.data(), p = post.data();
    const a = Buffer.from(t.hash, 'hex'), b = Buffer.from(sha(token), 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpsError('permission-denied', 'This confirmation link is not valid.');
    if (p.status !== 'unconfirmed') return { status: p.status, memorialId: p.memorialId, already: true };
    if (t.expiresAt.toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'This confirmation link has expired. Please post your remembrance again.');
    const status = cfg.exists && cfg.data().requireApproval === true ? 'pending' : 'published';
    tx.update(postRef, { status, confirmedAt: FieldValue.serverTimestamp() });
    tx.update(tokRef, { usedAt: FieldValue.serverTimestamp() });
    tx.create(db.collection('activity').doc(), { type: 'remembrance.confirmed', summary: `${p.name} confirmed their remembrance${status === 'pending' ? ' (awaiting approval)' : ' (now public)'}`, actorUid: 'system', actorName: p.name, memorialId: p.memorialId, targetId: id, at: FieldValue.serverTimestamp() });
    return { status, memorialId: p.memorialId };
  });
});

export const cleanupUnconfirmedRemembrances = onSchedule('every day 03:00', async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - CLEANUP_DAYS * 864e5);
  const s = await db.collection('remembrances').where('status', '==', 'unconfirmed').where('createdAt', '<', cutoff).limit(400).get();
  if (s.empty) return;
  const b = db.batch();
  s.docs.forEach(d => { b.delete(d.ref); b.delete(db.doc(`remembranceContacts/${d.id}`)); b.delete(db.doc(`remembranceTokens/${d.id}`)); });
  await b.commit();
  await log('remembrance.cleanup', `Removed ${s.size} unconfirmed remembrance${s.size > 1 ? 's' : ''} older than ${CLEANUP_DAYS} days`, { actorName: 'System' });
});
