import { isDesignatedAdminEmail } from '../../src/config/adminConfig.js';
import { withSellerDraftRequest } from './seller-draft-narrative.js';

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'administrator-required' });

    const input = req.body;
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some(key => !['auctionId', 'expectedRevision', 'notes'].includes(key)) ||
        typeof input.auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.auctionId) ||
        !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
        input.expectedRevision >= Number.MAX_SAFE_INTEGER ||
        typeof input.notes !== 'string' || input.notes.length > 4000) {
      return res.status(422).json({ error: 'invalid-review-request' });
    }

    const { auctionId, expectedRevision, notes } = input;
    const ref = firestore.collection('auctions').doc(auctionId);
    const revision = expectedRevision + 1;
    const status = await firestore.runTransaction(async transaction => {
      const listing = (await transaction.get(ref)).data();
      if (!listing) return 404;
      if (listing.status !== 'pending_review' || (listing.sellerDraftRevision ?? 0) !== expectedRevision) return 409;

      const now = Date.now();
      transaction.create(ref.collection('reviewHistory').doc(String(revision)), {
        action: 'returned_to_draft', administratorUid: uid, notes: notes.trim(), createdAt: now
      });
      transaction.update(ref, { status: 'draft', sellerDraftRevision: revision, updatedAt: now });
      return 200;
    });

    if (status !== 200) return res.status(status).json({ error: 'review-state-or-revision-conflict' });
    return res.status(200).json({ status: 'draft', revision });
  });
}
