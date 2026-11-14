import { timingSafeEqual } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { getFirebaseAdminServices } from './_lib/firebaseAdmin.js';

function isAuthorized(value: unknown, secret: string) {
  if (typeof value !== 'string') return false;
  const supplied = Buffer.from(value);
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function deliver(firestore: Firestore, auctionId: string, revision: number, apiKey: string, recipient: string) {
  const eventRef = firestore.collection('auctionReviewOutbox').doc(auctionId)
    .collection('events').doc(String(revision));
  const queueRef = firestore.collection('auctionReviewQueue').doc(`${auctionId}:${revision}`);
  const event = (await eventRef.get()).data();
  if (!event || event.type !== 'listing_submitted_for_review' ||
      event.auctionId !== auctionId || event.revision !== revision) {
    await queueRef.delete();
    return 'missing';
  }
  if (event.status === 'sent' || event.status === 'reconciliation_required') {
    await queueRef.delete();
    return event.status;
  }
  if (event.status !== 'queued' || typeof event.createdAt !== 'number' ||
      Date.now() - event.createdAt > 60 * 60 * 1000) {
    await firestore.runTransaction(async transaction => {
      const current = (await transaction.get(eventRef)).data();
      if (current?.status === 'queued') transaction.update(eventRef, { status: 'reconciliation_required' });
      transaction.delete(queueRef);
    });
    return 'reconciliation_required';
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `wailtail-review/${auctionId}/${revision}`
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'Wailtail Curation <consignments@wailtail.com>',
      to: [recipient],
      subject: 'Wailtail listing submitted for review',
      text: `Listing ${auctionId} was submitted for review. Sign in to the Wailtail administrator portal to review it.`
    }),
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) return 'retry';

  const batch = firestore.batch();
  batch.update(eventRef, { status: 'sent', sentAt: Date.now() });
  batch.delete(queueRef);
  await batch.commit();
  return 'sent';
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  const drain = req.method === 'GET';
  if (!drain && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  const secret = (drain ? process.env.CRON_SECRET : process.env.AUCTION_REVIEW_WORKER_SECRET)?.trim();
  if (!secret) return res.status(503).json({ error: 'review-worker-unconfigured' });
  if (!isAuthorized(req.headers?.authorization, secret)) return res.status(401).json({ error: 'unauthorized' });

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipient = process.env.AUCTION_REVIEW_RECIPIENT?.trim();
  if (!apiKey || !recipient) return res.status(503).json({ error: 'review-delivery-unconfigured' });

  try {
    const { firestore } = getFirebaseAdminServices();
    if (drain) {
      const queue = await firestore.collection('auctionReviewQueue').orderBy('createdAt').limit(10).get();
      const results = await Promise.allSettled(queue.docs.map(async item => {
        const { auctionId, revision } = item.data();
        if (!validEvent(auctionId, revision) || item.id !== `${auctionId}:${revision}`) {
          await item.ref.delete();
          return 'invalid';
        }
        return deliver(firestore, auctionId, revision, apiKey, recipient);
      }));
      const pending = results.filter(result => result.status === 'rejected' || result.value === 'retry').length;
      return res.status(pending ? 503 : 200).json({ processed: results.length, pending });
    }
    const { auctionId, revision } = req.body ?? {};
    if (!validEvent(auctionId, revision)) return res.status(422).json({ error: 'invalid-review-event' });
    const status = await deliver(firestore, auctionId, revision, apiKey, recipient);
    return res.status(status === 'sent' ? 200 : status === 'missing' ? 404 : status === 'retry' ? 503 : 409).json({ status });
  } catch {
    return res.status(503).json({ error: 'review-delivery-unavailable' });
  }
}

function validEvent(auctionId: unknown, revision: unknown) {
  return typeof auctionId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) &&
    typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 1;
}
