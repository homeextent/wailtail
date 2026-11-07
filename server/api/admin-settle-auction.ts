import type { Firestore } from 'firebase-admin/firestore';
import { isDesignatedAdminEmail } from '../../src/config/adminConfig.js';
import { withSellerDraftRequest } from './seller-draft-narrative.js';

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, _uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'Administrator access required.' });
    const { auctionId } = req.body ?? {};
    if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId)) {
      return res.status(422).json({ error: 'Invalid auction ID.' });
    }
    const result = await settleAuction(firestore, auctionId);
    if (result >= 400) return res.status(result).json({ error: 'Auction cannot be settled.' });
    return res.status(200).json({ success: true, settled: result === 201 });
  });
}

export async function settleAuction(firestore: Firestore, auctionId: string, clockOnly = false) {
  const ref = firestore.collection('auctions').doc(auctionId);
    return firestore.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      if (!data) return 404;
      const now = Date.now();
      if (clockOnly) {
        if (!['active', 'live', 'ending_soon', 'upcoming', 'ended', 'sold', 'reserve_not_met'].includes(data.status) ||
            !Number.isFinite(data.startTime) || !Number.isFinite(data.endTime) || now < data.startTime) return 409;
        if (now < data.endTime) {
          if (data.status !== 'upcoming') return 409;
          tx.update(ref, { status: 'active', updatedAt: now });
          return 202;
        }
      }
      if (data.winningEmailSent === true || data.settlementCompletedAt) return 200;
      if (!['active', 'live', 'ending_soon', 'upcoming', 'ended', 'sold', 'reserve_not_met'].includes(data.status) ||
          (!['ended', 'sold', 'reserve_not_met'].includes(data.status) &&
            (!Number.isFinite(data.endTime) || now < data.endTime))) return 409;

      const eligible = (records: FirebaseFirestore.QuerySnapshot) => records.docs.map(doc => ({
        id: doc.id, data: doc.data()
      })).filter(bid => bid.data.status !== 'retracted' && Number.isSafeInteger(bid.data.amount) && bid.data.amount > 0);
      const nested = await tx.get(ref.collection('bids'));
      let bids = eligible(nested);
      if (!bids.length) bids = eligible(await tx.get(firestore.collection('bids').where('auctionId', '==', auctionId)));
      bids.sort((a, b) => b.data.amount - a.data.amount ||
        (Number(a.data.timestamp) || 0) - (Number(b.data.timestamp) || 0) || a.id.localeCompare(b.id));
      const winner = bids[0]?.data;
      const reserve = Number(data.reserveAmount) || 0;
      if (!winner || winner.amount < reserve) {
        tx.update(ref, { status: 'ended', isReserveMet: false, settlementCompletedAt: now, updatedAt: now });
        return 201;
      }
      const emailAddress = (value: unknown) => typeof value === 'string' && /^[^\s@]+@[^\s@]+$/.test(value.trim()) ? value.trim() : '';
      const bidderId = typeof winner.bidderId === 'string' && !winner.bidderId.includes('/') ? winner.bidderId : '';
      let recipient = emailAddress(winner.bidderEmail);
      if (!recipient && bidderId) {
        const [user, bidder] = await tx.getAll(firestore.collection('users').doc(bidderId), firestore.collection('bidders').doc(bidderId));
        recipient = emailAddress(user.get('email')) || emailAddress(bidder.get('email'));
      }
      if (!recipient && bidderId && bidderId === data.highBidderId) recipient = emailAddress(data.highBidderEmail);
      if (!recipient) return 422;

      const sellerId = typeof data.sellerId === 'string' && !data.sellerId.includes('/') ? data.sellerId : '';
      const seller = sellerId ? (await tx.get(firestore.collection('users').doc(sellerId))).data() : undefined;
      const application = !emailAddress(data.sellerEmail) && !emailAddress(seller?.email)
        ? (await tx.get(firestore.collection('consignment_applications').where('convertedAuctionId', '==', auctionId).limit(1))).docs[0]?.data()
        : undefined;
      const contact = emailAddress(data.sellerEmail) || emailAddress(seller?.email) ||
        emailAddress(application?.sellerEmail) || 'contact@wailtail.com';
      const phone = [data.sellerPhone, seller?.phone, application?.sellerPhone]
        .find(value => typeof value === 'string' && value.trim());
      const title = typeof data.title === 'string' ? data.title : 'Wailtail auction';
      const amount = `$${winner.amount.toLocaleString('en-CA')} CAD`;
      tx.create(firestore.collection('auctionNotificationOutbox').doc(`auction-winner-${auctionId}`), {
        status: 'queued', from: process.env.RESEND_FROM_EMAIL || 'Wailtail <consignments@wailtail.com>',
        to: [recipient], message: { subject: `[Wailtail] Winning bid on ${title}`,
          text: `Your winning bid was ${amount}. Contact the seller at ${contact}${phone ? ` or ${phone}` : ''}.` },
        createdAt: now, notificationType: 'auction_won', metadata: { auctionId }
      });
      tx.update(ref, {
        status: 'sold', isReserveMet: true, settlementCompletedAt: now, winnerNotificationQueuedAt: now,
        currentBid: winner.amount, highBidderId: bidderId,
        highBidderName: typeof winner.bidderName === 'string' ? winner.bidderName : 'Bidder',
        highBidderEmail: recipient, updatedAt: now
      });
      return 201;
    });
}
