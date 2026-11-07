import { timingSafeEqual } from 'node:crypto';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getFirebaseAdminServices } from './_lib/firebaseAdmin';

async function deliver(firestore: Firestore, item: QueryDocumentSnapshot, apiKey: string) {
  const record = item.data();
  const valid = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) &&
    record.createdAt <= Date.now() && Date.now() - record.createdAt <= 60 * 60 * 1000 &&
    typeof record.from === 'string' && Array.isArray(record.to) && record.to.length === 1 &&
    typeof record.to[0] === 'string' && /^[^\s@]+@[^\s@]+$/.test(record.to[0]) &&
    typeof record.message?.subject === 'string' && typeof record.message?.text === 'string';
  if (!valid) {
    await firestore.runTransaction(async tx => {
      if ((await tx.get(item.ref)).get('status') === 'queued') {
        tx.update(item.ref, { status: 'reconciliation_required' });
      }
    });
    return 'reconciliation_required';
  }

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
  if (!response.ok) return 'retry';
  const payload = await response.json();
  if (typeof payload.id !== 'string' || !payload.id) return 'retry';

  await firestore.runTransaction(async tx => {
    const current = await tx.get(item.ref);
    if (current.get('status') === 'queued') {
      const auctionId = record.metadata?.auctionId;
      const auctionRef = record.notificationType === 'auction_won' && typeof auctionId === 'string' &&
        /^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ? firestore.collection('auctions').doc(auctionId) : null;
      const auction = auctionRef ? await tx.get(auctionRef) : null;
      tx.update(item.ref, { status: 'accepted', acceptedAt: Date.now(), providerId: payload.id });
      if (auction?.exists && auction.get('winnerNotificationQueuedAt') === record.createdAt) {
        tx.update(auction.ref, { winningEmailSent: true });
      }
    }
  });
  return 'accepted';
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
    const queued = await firestore.collection('auctionNotificationOutbox').where('status', '==', 'queued').limit(10).get();
    const results = await Promise.allSettled(queued.docs.map(item => deliver(firestore, item, apiKey)));
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
