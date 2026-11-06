import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDraftNarrativeWrite, handleSellerDraftNarrative, parseDraftNarrative } from '../api/seller-draft-narrative';

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
  rejectCommit = false
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
        return { doc: (id: string) => `${name}/${id}` };
      },
      async runTransaction(run: (transaction: unknown) => Promise<number>) {
        const staged: unknown[] = [];
        const result = await run({
          async get() {
            return { data: () => ({ ...auction, sellerEmail: 'seller@example.test' }) };
          },
          set(...args: unknown[]) { staged.push(args); },
          update(...args: unknown[]) { staged.push(args); }
        });
        if (rejectCommit) throw new Error('simulated commit rejection');
        writes.push(...staged);
        return result;
      }
    }
  } as unknown as Services;
  await handleSellerDraftNarrative({
    method: 'POST',
    headers: { authorization: 'Bearer synthetic-token' },
    body: payload
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
