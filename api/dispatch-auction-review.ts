import { timingSafeEqual } from 'node:crypto';

// HTTPS test target derived from Wailtail worker f9f56c7. All state is
// request-local and synthetic. No Firebase or email SDK is loaded.
export default async function handler(req: any, res: any) {
  const eventPath = 'auctionReviewOutbox/synthetic-auction/events/1';
  const queuePath = 'auctionReviewQueue/synthetic-auction:1';
  const createdAt = Date.now();
  const fixture = { auctionId: 'synthetic-auction', revision: 1, createdAt };
  const docs = new Map<string, Record<string, unknown>>([
    [eventPath, { ...fixture, type: 'listing_submitted_for_review', status: 'queued' }],
    [queuePath, fixture]
  ]);

  function ref(path: string) {
    return {
      path,
      collection: (name: string) => collection(`${path}/${name}`),
      get: async () => ({ data: () => docs.get(path) }),
      delete: async () => { docs.delete(path); }
    };
  }

  function collection(path: string) {
    return {
      doc: (id: string) => ref(`${path}/${id}`),
      orderBy: (_field: string) => ({
        limit: (count: number) => ({
          get: async () => ({
            docs: [...docs].filter(([key]) => key.startsWith(`${path}/`)).slice(0, count).map(([key, value]) => ({
              id: key.split('/').at(-1), ref: ref(key), data: () => value
            }))
          })
        })
      })
    };
  }

  function batch() {
    const writes: Array<() => void> = [];
    return {
      get: (target: ReturnType<typeof ref>) => target.get(),
      update: (target: ReturnType<typeof ref>, patch: Record<string, unknown>) => {
        writes.push(() => docs.set(target.path, { ...docs.get(target.path), ...patch }));
      },
      delete: (target: ReturnType<typeof ref>) => { writes.push(() => docs.delete(target.path)); },
      commit: async () => { for (const write of writes) write(); }
    };
  }

  function getFirebaseAdminServices() {
    return { firestore: { collection, batch,
      runTransaction: async (operation: (tx: ReturnType<typeof batch>) => Promise<void>) => {
        const tx = batch();
        await operation(tx);
        await tx.commit();
      }
    } };
  }

  async function stubEmail(url: string, request: { headers: Record<string, string> }) {
    if (url !== 'https://api.resend.com/emails' ||
        request.headers['Idempotency-Key'] !== 'wailtail-review/synthetic-auction/1') {
      throw new Error('Unexpected synthetic provider call');
    }
    return { ok: true };
  }

  function isAuthorized(value: unknown, secret: string) {
    if (typeof value !== 'string') return false;
    const supplied = Buffer.from(value);
    const expected = Buffer.from(`Bearer ${secret}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  async function deliver(firestore: ReturnType<typeof getFirebaseAdminServices>['firestore'], auctionId: string, revision: number, apiKey: string, recipient: string) {
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

    const response = await stubEmail('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `wailtail-review/${auctionId}/${revision}`
      },
      body: JSON.stringify({
        from: 'fixture@example.test',
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

  async function worker(req: any, res: any) {
    res.setHeader('Cache-Control', 'no-store');
    const drain = req.method === 'GET';
    if (!drain && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'method-not-allowed' });
    }
    const secret = (drain ? process.env.CRON_SECRET : process.env.AUCTION_REVIEW_WORKER_SECRET)?.trim();
    if (!secret) return res.status(503).json({ error: 'review-worker-unconfigured' });
    if (!isAuthorized(req.headers?.authorization, secret)) return res.status(401).json({ error: 'unauthorized' });

    const apiKey = 'synthetic-provider-key';
    const recipient = 'review@example.test';
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

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  return worker(req, res);
}
