import { isDesignatedAdminEmail } from '../../src/config/adminConfig.js';
import { projectPublicMedia } from './public-auctions.js';
import { withSellerDraftRequest } from './seller-draft-narrative.js';
import type { FirebaseAdminServices } from './_lib/firebaseAdmin.js';

export function handleAdminDuplicateAuction(req: any, res: any, services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>) {
  return withSellerDraftRequest(req, res, services, async ({ firestore }, _uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'Administrator access required.' });
    const { auctionId } = req.body ?? {};
    if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId)) {
      return res.status(422).json({ error: 'Invalid source auction.' });
    }
    const source = firestore.collection('auctions').doc(auctionId);
    const mediaId = auctionId === 'wailtail-1978-porsche-911' ? 'main-media-config' : `media-${auctionId}`;
    const target = firestore.collection('auctions').doc();
    const copied = await firestore.runTransaction(async tx => {
      const [listing, media] = await tx.getAll(source, firestore.collection('settings').doc(mediaId));
      const data = listing.data();
      if (!data) return null;
      if (data.sellerType === 'dealer' || data.dealerId) return false;
      const now = Date.now();
      const title = `${typeof data.title === 'string' ? data.title : 'Vehicle Listing'} (Copy)`;
      const copy = {
        ...data, id: target.id, title,
        headline: typeof data.headline === 'string' && data.headline ? `${data.headline} (Copy)` : title,
        status: 'draft', currentBid: 0, bidCount: 0, highBidderId: '', highBidderName: '', highBidderEmail: '',
        isReserveMet: (Number(data.reserveAmount) || 0) <= 0,
        watchCount: 0, sellerDraftRevision: 0, startTime: now, endTime: now + 604800000,
        createdAt: now, updatedAt: now
      };
      for (const field of ['watchlist', 'winningEmailSent', 'settlementCompletedAt', 'winnerNotificationQueuedAt']) {
        delete copy[field];
      }
      tx.create(target, copy);
      tx.create(firestore.collection('settings').doc(`media-${target.id}`), {
        ...projectPublicMedia(media.data() ?? {}), vehicleName: title
      });
      return copy;
    });
    if (copied === false) return res.status(409).json({ error: 'Dealer listings require a separately reviewed canonical application; duplication is unavailable.' });
    return copied ? res.status(201).json({ auction: copied }) : res.status(404).json({ error: 'Source listing not found.' });
  });
}
export default handleAdminDuplicateAuction;
