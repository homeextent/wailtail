import { isDesignatedAdminEmail } from '../../src/config/adminConfig.js';
import { withSellerDraftRequest } from './seller-draft-narrative.js';

const MAX_RECORDS = 400;

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, _uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'Administrator access required.' });
    const { auctionId, startingBid } = req.body ?? {};
    if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ||
        (startingBid !== undefined && (!Number.isSafeInteger(startingBid) || startingBid < 0))) {
      return res.status(422).json({ error: 'Invalid auction reset.' });
    }
    const auction = firestore.collection('auctions').doc(auctionId);
    const status = await firestore.runTransaction(async tx => {
      const record = (await tx.get(auction)).data();
      if (!record) return 404;
      if (record.settlementCompletedAt || record.winningEmailSent || record.winnerNotificationQueuedAt) return 409;
      const queries = [
        auction.collection('bids'),
        firestore.collection('bids').where('auctionId', '==', auctionId),
        firestore.collection('comments').where('auctionId', '==', auctionId).where('isBid', '==', true)
      ];
      const refs: FirebaseFirestore.DocumentReference[] = [];
      for (const query of queries) {
        const snapshot = await tx.get(query.limit(MAX_RECORDS));
        refs.push(...snapshot.docs.map(doc => doc.ref));
        if (refs.length + 1 > MAX_RECORDS) return 413;
      }
      for (const ref of refs) tx.delete(ref);
      tx.update(auction, {
        ...(startingBid !== undefined ? { startingBid } : {}),
        currentBid: 0, bidCount: 0, highBidderId: '', highBidderName: '', highBidderEmail: '',
        isReserveMet: (Number(record.reserveAmount) || 0) <= 0, updatedAt: Date.now()
      });
      return 200;
    });
    if (status === 413) return res.status(409).json({ error: 'Auction has too many related records for a single reset. A separate large-record cleanup is required; no changes were made.' });
    if (status !== 200) return res.status(status).json({ error: 'Auction reset requires review.' });
    return res.status(200).json({ success: true });
  });
}
