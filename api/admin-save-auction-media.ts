import { isDesignatedAdminEmail } from '../src/config/adminConfig';
import { projectPublicMedia } from './public-auctions';
import { withSellerDraftRequest } from './seller-draft-narrative';

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, _uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'Administrator access required.' });
    const { auctionId, config } = req.body ?? {};
    if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ||
        !config || typeof config !== 'object' || Array.isArray(config) ||
        !Array.isArray(config.heroImages) || !Array.isArray(config.fullGallery)) {
      return res.status(422).json({ error: 'Invalid listing media.' });
    }
    const media = projectPublicMedia(config);
    if (Buffer.byteLength(JSON.stringify(media), 'utf8') > 750_000) {
      return res.status(422).json({ error: 'Listing media is too large. Upload the images first.' });
    }
    const auction = firestore.collection('auctions').doc(auctionId);
    const mediaId = auctionId === 'wailtail-1978-porsche-911' ? 'main-media-config' : `media-${auctionId}`;
    const saved = await firestore.runTransaction(async tx => {
      if (!(await tx.get(auction)).exists) return false;
      const updatedAt = Date.now();
      tx.set(firestore.collection('settings').doc(mediaId), { ...media, updatedAt }, { merge: true });
      tx.update(auction, { leadHeroImage: media.heroImages[0] || '', updatedAt });
      return true;
    });
    return saved ? res.status(200).json({ saved: true }) : res.status(404).json({ error: 'Listing not found.' });
  });
}
