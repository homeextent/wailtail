import { isDesignatedAdminEmail } from '../src/config/adminConfig';
import { withSellerDraftRequest } from './seller-draft-narrative';

const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'Administrator access required.' });
    const { auctionId, bidId, reason } = req.body ?? {};
    if (!validId(bidId) || (auctionId !== undefined && auctionId !== '' && !validId(auctionId)) ||
        typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) {
      return res.status(422).json({ error: 'A bid and retraction reason are required.' });
    }
    const root = firestore.collection('bids').doc(bidId);
    const outcome = await firestore.runTransaction(async tx => {
      const rootSnapshot = await tx.get(root);
      const parentId = auctionId || rootSnapshot.get('auctionId');
      if (!validId(parentId)) return 404;
      const auction = firestore.collection('auctions').doc(parentId);
      const nested = auction.collection('bids').doc(bidId);
      const [parent, nestedSnapshot] = await tx.getAll(auction, nested);
      if (!rootSnapshot.exists && !nestedSnapshot.exists) return 404;
      if ([rootSnapshot, nestedSnapshot].some(snapshot =>
        snapshot.exists && snapshot.get('auctionId') && snapshot.get('auctionId') !== parentId)) return 409;
      if (parent.get('settlementCompletedAt') || parent.get('winningEmailSent') === true) return 409;

      const record = rootSnapshot.exists ? rootSnapshot.data()! : nestedSnapshot.data()!;
      if (record.status === 'retracted') return 200;
      const candidates = new Map<string, FirebaseFirestore.DocumentData>();
      if (parent.exists) {
        const [rootBids, nestedBids] = await Promise.all([
          tx.get(firestore.collection('bids').where('auctionId', '==', parentId)),
          tx.get(auction.collection('bids'))
        ]);
        for (const snapshot of [...rootBids.docs, ...nestedBids.docs]) {
          const data = snapshot.data();
          const previous = candidates.get(snapshot.id);
          if (!previous || data.status === 'retracted') candidates.set(snapshot.id, data);
        }
      }
      const now = Date.now();
      const audit = { status: 'retracted', retractedAt: now, retractionReason: reason.trim(),
        retractedBy: uid, retractedByName: email || 'Administrator' };
      if (rootSnapshot.exists) tx.update(root, audit);
      if (nestedSnapshot.exists) tx.update(nested, audit);
      if (parent.exists) {
        const remaining = [...candidates.entries()].filter(([id, data]) =>
          id !== bidId && data.status !== 'retracted' && Number.isSafeInteger(data.amount) && data.amount > 0);
        remaining.sort(([idA, a], [idB, b]) => b.amount - a.amount ||
          (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0) || idA.localeCompare(idB));
        const highest = remaining[0]?.[1];
        const data = parent.data()!;
        tx.update(auction, {
          currentBid: highest?.amount ?? (Number(data.startingBid) || 0), bidCount: remaining.length,
          isReserveMet: Boolean(highest && highest.amount >= (Number(data.reserveAmount) || 0)),
          highBidderId: highest?.bidderId || '', highBidderName: highest?.bidderName || '',
          highBidderEmail: highest?.bidderEmail || '', updatedAt: now
        });
      }
      return 200;
    });
    if (outcome !== 200) return res.status(outcome).json({ error: 'Bid retraction unavailable.' });
    return res.status(200).json({ success: true });
  });
}
