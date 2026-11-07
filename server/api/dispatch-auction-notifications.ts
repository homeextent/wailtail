import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getFirebaseAdminServices } from './_lib/firebaseAdmin.js';

// Stay one hour inside Resend's 24-hour key retention, anchored conservatively
// to creation so legacy queued records cannot be replayed outside that window.
const RETRY_WINDOW = 23 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 24;
const LEASE_MS = 2 * 60 * 1000;

export async function deliver(firestore: Firestore, item: QueryDocumentSnapshot, apiKey: string) {
  const attemptId = randomUUID();
  const claim = await firestore.runTransaction(async tx => {
    const current = await tx.get(item.ref);
    const record = current.data();
    if (!record || !['queued', 'retrying'].includes(record.status)) return null;
    const now = Date.now();
    if (typeof record.nextAttemptAt === 'number' && record.nextAttemptAt > now) return null;
    const valid = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) &&
      record.createdAt <= now && now - record.createdAt < RETRY_WINDOW &&
      (record.attempts === undefined || (Number.isSafeInteger(record.attempts) && record.attempts >= 0)) &&
      (record.attempts ?? 0) < MAX_ATTEMPTS &&
      typeof record.from === 'string' && Array.isArray(record.to) && record.to.length === 1 &&
      typeof record.to[0] === 'string' && /^[^\s@]+@[^\s@]+$/.test(record.to[0]) &&
      typeof record.message?.subject === 'string' && typeof record.message?.text === 'string';
    if (!valid) {
      tx.update(item.ref, { status: 'reconciliation_required', nextAttemptAt: null,
        reconciliationReason: 'invalid-or-retry-limit', reconciliationAt: now });
      return 'reconciliation_required' as const;
    }
    const attempts = (record.attempts ?? 0) + 1;
    tx.update(item.ref, { status: 'retrying', attempts, attemptId,
      firstAttemptAt: record.firstAttemptAt ?? now, lastAttemptAt: now, nextAttemptAt: now + LEASE_MS });
    return { record, attempts };
  });
  if (!claim) return 'skipped';
  if (claim === 'reconciliation_required') return claim;
  const { record, attempts } = claim;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `wailtail-auction/${item.id}`
      },
      body: JSON.stringify({ from: record.from, to: record.to,
        subject: record.message.subject, text: record.message.text }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('provider-unavailable');
    const payload = await response.json();
    if (typeof payload.id !== 'string' || !payload.id) throw new Error('invalid-provider-response');
    await firestore.runTransaction(async tx => {
      const current = await tx.get(item.ref);
      if (current.get('status') === 'retrying' && current.get('attemptId') === attemptId) {
        const auctionId = record.metadata?.auctionId;
        const auctionRef = record.notificationType === 'auction_won' && typeof auctionId === 'string' &&
          /^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ? firestore.collection('auctions').doc(auctionId) : null;
        const auction = auctionRef ? await tx.get(auctionRef) : null;
        tx.update(item.ref, { status: 'accepted', acceptedAt: Date.now(), providerId: payload.id, nextAttemptAt: null });
        if (auction?.exists && auction.get('winnerNotificationQueuedAt') === record.createdAt) {
          tx.update(auction.ref, { winningEmailSent: true });
        }
      }
    });
    return 'accepted';
  } catch {
    // An uncertain provider result must reuse the identical key and payload.
    // If this update also fails, the persisted claim becomes eligible after its lease.
    return firestore.runTransaction(async tx => {
      const current = await tx.get(item.ref);
      if (current.get('status') !== 'retrying' || current.get('attemptId') !== attemptId) return 'skipped';
      const nextAttemptAt = Date.now() + Math.min(60_000 * 2 ** (attempts - 1), 60 * 60 * 1000);
      const exhausted = attempts >= MAX_ATTEMPTS || nextAttemptAt >= record.createdAt + RETRY_WINDOW;
      tx.update(item.ref, { nextAttemptAt: exhausted ? null : nextAttemptAt,
        ...(exhausted ? { status: 'reconciliation_required', reconciliationAt: Date.now(),
          reconciliationReason: 'retry-limit' } : {}) });
      return exhausted ? 'reconciliation_required' : 'retry';
    });
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return res.status(503).json({ error: 'notification-worker-unconfigured' });
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = typeof req.headers?.authorization === 'string'
    ? Buffer.from(req.headers.authorization) : Buffer.alloc(0);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return res.status(503).json({ error: 'notification-provider-unconfigured' });

  try {
    const { firestore } = getFirebaseAdminServices();
    const outbox = firestore.collection('auctionNotificationOutbox');
    // Separate first attempts from due retries; deferred messages cannot starve
    // fresh messages, and the due query needs only the automatic single-field index.
    const [queued, due] = await Promise.all([
      outbox.where('status', '==', 'queued').limit(10).get(),
      outbox.where('nextAttemptAt', '>', 0).where('nextAttemptAt', '<=', Date.now()).limit(10).get()
    ]);
    const items = new Map<string, QueryDocumentSnapshot>();
    for (let index = 0; index < 10 && items.size < 10; index++) {
      for (const item of [queued.docs[index], due.docs[index]]) {
        if (item && items.size < 10) items.set(item.id, item);
      }
    }
    const results = await Promise.allSettled([...items.values()].map(item => deliver(firestore, item, apiKey)));
    const pending = results.filter(result => result.status === 'rejected' || result.value === 'retry').length;
    const reconciliationRequired = results.filter(result =>
      result.status === 'fulfilled' && result.value === 'reconciliation_required').length;
    return res.status(pending || reconciliationRequired ? 503 : 200).json({
      processed: results.length, pending, reconciliationRequired
    });
  } catch {
    return res.status(503).json({ error: 'notification-delivery-unavailable' });
  }
}
