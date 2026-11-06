import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdminServices } from './_lib/firebaseAdmin';

function isAuthorized(value: unknown, secret: string) {
  if (typeof value !== 'string') return false;
  const supplied = Buffer.from(value);
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

// Invoked by an authorized worker with the committed outbox event identity.
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  const secret = process.env.AUCTION_REVIEW_WORKER_SECRET?.trim();
  if (!secret) return res.status(503).json({ error: 'review-worker-unconfigured' });
  if (!isAuthorized(req.headers?.authorization, secret)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { auctionId, revision } = req.body ?? {};
  if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ||
      typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) {
    return res.status(422).json({ error: 'invalid-review-event' });
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipient = process.env.AUCTION_REVIEW_RECIPIENT?.trim();
  if (!apiKey || !recipient) return res.status(503).json({ error: 'review-delivery-unconfigured' });

  try {
    const { firestore } = getFirebaseAdminServices();
    const eventRef = firestore.collection('auctionReviewOutbox').doc(auctionId)
      .collection('events').doc(String(revision));
    const event = (await eventRef.get()).data();
    if (!event || event.type !== 'listing_submitted_for_review' ||
        event.auctionId !== auctionId || event.revision !== revision) {
      return res.status(404).json({ error: 'review-event-not-found' });
    }
    if (event.status === 'sent') return res.status(200).json({ status: 'sent' });
    if (event.status !== 'queued' || typeof event.createdAt !== 'number' ||
        Date.now() - event.createdAt > 60 * 60 * 1000) {
      return res.status(409).json({ error: 'review-event-requires-reconciliation' });
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
    if (!response.ok) return res.status(503).json({ error: 'review-delivery-unavailable' });

    await eventRef.update({ status: 'sent', sentAt: Date.now() });
    return res.status(200).json({ status: 'sent' });
  } catch {
    return res.status(503).json({ error: 'review-delivery-unavailable' });
  }
}
