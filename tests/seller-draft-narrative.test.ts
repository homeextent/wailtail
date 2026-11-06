import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDraftNarrativeWrite, handleSellerDraftNarrative, handleSellerDraftSubmission, parseDraftNarrative } from '../api/seller-draft-narrative';

const payload = {
  auctionId: 'test-draft',
  expectedRevision: 0,
  overviewHeading: 'Overview',
  overviewParagraphs: ['First paragraph']
};

test('seller narrative accepts only bounded overview fields', () => {
  assert.deepEqual(parseDraftNarrative(payload), payload);
  assert.equal(parseDraftNarrative({ ...payload, sellerId: 'other' }), null);
  assert.equal(parseDraftNarrative({ ...payload, overviewParagraphs: [{ text: 'nested' }] }), null);
  assert.equal(parseDraftNarrative({ ...payload, auctionId: 'other/path' }), null);
  assert.equal(parseDraftNarrative({ ...payload, expectedRevision: -1 }), null);
});

test('seller draft access requires exact UID, draft state and current revision', () => {
  const draft = { sellerId: 'seller', status: 'draft' };
  assert.equal(checkDraftNarrativeWrite(draft, 'seller', 0), 200);
  assert.equal(checkDraftNarrativeWrite(draft, 'other', 0), 404);
  assert.equal(checkDraftNarrativeWrite({ status: 'draft' }, 'seller', 0), 404);
  assert.equal(checkDraftNarrativeWrite({ ...draft, status: 'pending_review' }, 'seller', 0), 409);
  assert.equal(checkDraftNarrativeWrite({ ...draft, sellerDraftRevision: 1 }, 'seller', 0), 409);
});

type Services = NonNullable<Parameters<typeof handleSellerDraftNarrative>[2]>;

async function invokeSellerNarrative(
  uid: string,
  auction: { sellerId?: string; status: string; sellerDraftRevision?: number },
  rejectCommit = false,
  options: { submit?: boolean; retryWithPendingReview?: boolean; body?: unknown } = {}
) {
  let status = 0;
  let body: unknown;
  const writes: unknown[] = [];
  const res = {
    setHeader() {},
    status(value: number) {
      status = value;
      return this;
    },
    json(value: unknown) {
      body = value;
    }
  };
  const services = {
    auth: {
      async verifyIdToken(token: string, checkRevoked: boolean) {
        assert.equal(token, 'synthetic-token');
        assert.equal(checkRevoked, true);
        return { uid, email: 'seller@example.test', email_verified: true };
      }
    },
    firestore: {
      collection(name: string) {
        return { doc: (id: string) => ({ id, path: `${name}/${id}`, collection: (child: string) => ({
          doc: (eventId: string) => ({ path: `${name}/${id}/${child}/${eventId}` })
        }) }) };
      },
      async runTransaction(run: (transaction: unknown) => Promise<number>) {
        const staged: unknown[] = [];
        const attempt = (record: typeof auction) => run({
          async get() {
            return { data: () => ({ title: 'Synthetic lot', make: 'Porsche', model: '928', year: 1988, ...record, sellerEmail: 'seller@example.test' }) };
          },
          set(ref: { path: string }, ...args: unknown[]) { staged.push([ref.path, ...args]); },
          create(ref: { path: string }, ...args: unknown[]) { staged.push([ref.path, ...args]); },
          update(ref: { path: string }, ...args: unknown[]) { staged.push([ref.path, ...args]); }
        });
        let result = await attempt(auction);
        if (options.retryWithPendingReview) {
          staged.length = 0;
          result = await attempt({ ...auction, status: 'pending_review' });
        }
        if (rejectCommit) throw new Error('simulated commit rejection');
        writes.push(...staged);
        return result;
      }
    }
  } as unknown as Services;
  const handle = options.submit ? handleSellerDraftSubmission : handleSellerDraftNarrative;
  await handle({
    method: 'POST',
    headers: { authorization: 'Bearer synthetic-token' },
    body: options.body ?? (options.submit ? { auctionId: payload.auctionId, expectedRevision: 0 } : payload)
  }, res, services);
  return { status, body, writes };
}

test('assigned seller commits narrative and revision together', async () => {
  const result = await invokeSellerNarrative('seller-a', { sellerId: 'seller-a', status: 'draft' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { revision: 1 });
  assert.deepEqual(result.writes, [
    ['settings/media-test-draft', {
      overviewHeading: payload.overviewHeading,
      overviewParagraphs: payload.overviewParagraphs,
      updatedAt: (result.writes[0] as [string, { updatedAt: number }])[1].updatedAt
    }, { merge: true }],
    ['auctions/test-draft', {
      sellerDraftRevision: 1,
      updatedAt: (result.writes[0] as [string, { updatedAt: number }])[1].updatedAt
    }]
  ]);
});

test('email matches cannot authorize another seller or an unassigned draft', async () => {
  for (const sellerId of ['seller-a', undefined]) {
    const result = await invokeSellerNarrative('seller-b', { sellerId, status: 'draft' });
    assert.equal(result.status, 404);
    assert.deepEqual(result.writes, []);
  }
});

test('pending review and stale revision produce no writes', async () => {
  for (const auction of [
    { sellerId: 'seller-a', status: 'pending_review' },
    { sellerId: 'seller-a', status: 'draft', sellerDraftRevision: 1 }
  ]) {
    const result = await invokeSellerNarrative('seller-a', auction);
    assert.equal(result.status, 409);
    assert.deepEqual(result.writes, []);
  }
});

test('transaction rejection is surfaced as a failed save', async () => {
  const result = await invokeSellerNarrative('seller-a', { sellerId: 'seller-a', status: 'draft' }, true);
  assert.equal(result.status, 503);
  assert.deepEqual(result.writes, []);
});

test('submission commits pending review and exactly one review event together', async () => {
  const result = await invokeSellerNarrative('seller-a', { sellerId: 'seller-a', status: 'draft' }, false, { submit: true });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { revision: 1, status: 'pending_review' });
  assert.equal(result.writes.length, 2);
  assert.match(JSON.stringify(result.writes[0]), /auctionReviewOutbox\/test-draft\/events\/1/);
  assert.match(JSON.stringify(result.writes[1]), /pending_review/);
});

test('submission retry rechecks state and commits neither change nor event', async () => {
  const result = await invokeSellerNarrative('seller-a', { sellerId: 'seller-a', status: 'draft' }, false, {
    submit: true, retryWithPendingReview: true
  });
  assert.equal(result.status, 409);
  assert.deepEqual(result.writes, []);
});

test('submission commit rejection never reports success or retains a review event', async () => {
  const result = await invokeSellerNarrative('seller-a', { sellerId: 'seller-a', status: 'draft' }, true, { submit: true });
  assert.equal(result.status, 503);
  assert.deepEqual(result.writes, []);
});

test('valid narrative mixed with a protected field causes no writes', async () => {
  const result = await invokeSellerNarrative('seller-a', { sellerId: 'seller-a', status: 'draft' }, false, {
    body: { ...payload, reserveAmount: 1 }
  });
  assert.equal(result.status, 422);
  assert.deepEqual(result.writes, []);
});
