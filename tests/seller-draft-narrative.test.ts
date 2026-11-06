import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDraftNarrativeWrite, parseDraftNarrative } from '../api/seller-draft-narrative';

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
