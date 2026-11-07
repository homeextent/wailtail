import { withSellerDraftRequest } from './seller-draft-narrative';

const SOFT_CLOSE_MS = 120_000;

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, uid, email) => {
    const input = req.body;
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== 2 ||
        typeof input.auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.auctionId) ||
        !Number.isSafeInteger(input.amount) || input.amount <= 0 || !email) {
      return res.status(422).json({ error: 'Invalid bid.' });
    }

    const { auctionId, amount } = input;
    const auctionRef = firestore.collection('auctions').doc(auctionId);
    const profileRef = firestore.collection('users').doc(uid);
    const bidderRef = firestore.collection('bidders').doc(uid);
    const bidRef = auctionRef.collection('bids').doc();
    const commentRef = firestore.collection('comments').doc();

    const result = await firestore.runTransaction(async tx => {
      const [auction, profile, bidder] = await tx.getAll(auctionRef, profileRef, bidderRef);
      const data = auction.data();
      const user = profile.data();
      const bidderData = bidder.data();
      const now = Date.now();

      if ([user, bidderData].some(record => record?.bannedFromBidding === true || record?.isBanned === true)) {
        return { status: 403, error: 'Your bidding privileges have been revoked.' };
      }
      if (!data || !['active', 'upcoming'].includes(data.status) ||
          !Number.isFinite(data.startTime) || !Number.isFinite(data.endTime) ||
          now < data.startTime || now >= data.endTime) {
        return { status: 409, error: 'This auction is not open for bidding.' };
      }
      if (data.sellerId === uid) {
        return { status: 403, error: 'Sellers cannot bid on their own auction.' };
      }

      const minimum = data.currentBid > 0 ? data.currentBid + data.minimumIncrement : data.startingBid;
      if (!Number.isSafeInteger(minimum) || minimum < 0 || amount < minimum) {
        return { status: 409, error: 'The bid is below the current minimum or bidding is unavailable.' };
      }

      const name = typeof user?.displayName === 'string' && user.displayName.trim()
        ? user.displayName.trim().slice(0, 120)
        : 'Bidder';
      const antiSniped = data.endTime - now <= SOFT_CLOSE_MS;
      const endTime = antiSniped ? now + SOFT_CLOSE_MS : data.endTime;
      const isReserveMet = data.isReserveMet === true || amount >= data.reserveAmount;
      const bid = {
        id: bidRef.id, auctionId, amount, bidderId: uid, bidderName: name,
        bidderHandle: name, bidderEmail: email, timestamp: now, antiSniped
      };
      tx.update(auctionRef, {
        currentBid: amount, bidCount: (data.bidCount || 0) + 1,
        highBidderId: uid, highBidderName: name, highBidderEmail: email,
        isReserveMet, endTime, updatedAt: now
      });
      tx.create(bidRef, bid);
      tx.create(firestore.collection('bids').doc(bidRef.id), bid);
      tx.create(commentRef, {
        id: commentRef.id, auctionId, userId: uid, userName: name, userBadge: 'Verified Bidder',
        text: `Bid placed for $${amount.toLocaleString('en-CA')}${antiSniped ? ' (Timer extended +2:00 via Anti-Sniping)' : ''}`,
        timestamp: now, upvotes: 0, upvotedBy: [], isBid: true, bidAmount: amount
      });

      const title = typeof data.title === 'string' ? data.title : 'Wailtail auction';
      const queue = (suffix: string, to: string, subject: string, text: string, notificationType: string) => {
        tx.create(firestore.collection('mail').doc(`bid-${bidRef.id}-${suffix}`), {
          to: [to], message: { subject, text }, createdAt: now, notificationType,
          metadata: { auctionId, bidId: bidRef.id }
        });
      };
      const formatted = `$${amount.toLocaleString('en-CA')} CAD`;
      queue('confirmation', email, `[Wailtail] Bid confirmed on ${title}`,
        `Your bid of ${formatted} was accepted. Reserve: ${isReserveMet ? 'met' : 'not yet met'}. Closing: ${new Date(endTime).toISOString()}.`,
        'bid_placed');
      if (typeof data.highBidderId === 'string' && data.highBidderId !== uid &&
          typeof data.highBidderEmail === 'string' && data.highBidderEmail.includes('@') &&
          data.highBidderEmail.toLowerCase() !== email.toLowerCase()) {
        queue('outbid', data.highBidderEmail, `[Wailtail] You were outbid on ${title}`,
          `The current bid is ${formatted}. Closing: ${new Date(endTime).toISOString()}.`, 'outbid_alert');
      }
      return { status: 200, success: true, antiSniped, newEndTime: antiSniped ? endTime : undefined };
    });

    if (result.status !== 200) return res.status(result.status).json({ error: result.error });
    return res.status(200).json({
      success: result.success, antiSniped: result.antiSniped, newEndTime: result.newEndTime
    });
  });
}
