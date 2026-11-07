import { isDesignatedAdminEmail } from '../../src/config/adminConfig';
import { withSellerDraftRequest } from './seller-draft-narrative';

const MAX_DELETE = 400;

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, _uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'Administrator access required.' });
    const { auctionId, cascadeDeleteConsignment } = req.body ?? {};
    if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ||
        typeof cascadeDeleteConsignment !== 'boolean') {
      return res.status(422).json({ error: 'Invalid listing deletion request.' });
    }
    const auction = firestore.collection('auctions').doc(auctionId);
    const projection = firestore.collection('auctionPublic').doc(auctionId);
    const outcome = await firestore.runTransaction(async tx => {
      const existing = await tx.get(auction);
      if (!existing.exists) return 'missing';
      const queries = [
        auction.collection('media'), auction.collection('bids'), auction.collection('draftAssets'),
        auction.collection('reviewHistory'), projection.collection('media'), projection.collection('bids'),
        projection.collection('comments'),
        firestore.collection('bids').where('auctionId', '==', auctionId),
        firestore.collection('comments').where('auctionId', '==', auctionId)
      ];
      const reviewOutbox = firestore.collection('auctionReviewOutbox').doc(auctionId);
      queries.push(reviewOutbox.collection('events'));
      if (cascadeDeleteConsignment) {
        for (const name of ['consignment_applications', 'consignments']) {
          queries.push(firestore.collection(name).where('convertedAuctionId', '==', auctionId));
        }
      }
      const refs = [auction, projection, reviewOutbox, firestore.collection('settings').doc(`media-${auctionId}`)];
      for (const query of queries) {
        const related = await tx.get(query.limit(MAX_DELETE + 1));
        for (const doc of related.docs) refs.push(doc.ref);
        if (refs.length > MAX_DELETE) return 'too-large';
      }
      for (const ref of refs) tx.delete(ref);
      return 'deleted';
    });
    if (outcome === 'too-large') return res.status(409).json({ error: 'Listing requires a separate large-record cleanup.' });
    return res.status(200).json({ deleted: outcome === 'deleted' });
  });
}
