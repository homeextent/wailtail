import { applyPublishedDraftImages } from './_lib/draftImagePlacement.js';
import { publicationStatuses } from './_lib/publishDraftImages.js';
import { isDesignatedAdminEmail } from '../../src/config/adminConfig.js';
import { projectPublicMedia } from './public-auctions.js';
import { withSellerDraftRequest } from './seller-draft-narrative.js';

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
      const record = await tx.get(auction);
      if (!record.exists) return false;
      const assets = publicationStatuses.has(record.get('status'))
        ? await tx.get(auction.collection('draftAssets').where('removedAt', '==', null).limit(100)) : null;
      const existingMedia = assets ? await tx.get(firestore.collection('settings').doc(mediaId)) : null;
      const finalMedia = assets ? applyPublishedDraftImages({ ...media, draftPublishedUrls: existingMedia?.get('draftPublishedUrls') || [] }, assets.docs.map(asset => ({ id: asset.id, ...asset.data() }))) : media;
      const updatedAt = Date.now();
      tx.set(firestore.collection('settings').doc(mediaId), { ...finalMedia, updatedAt }, { merge: true });
      tx.update(auction, { leadHeroImage: finalMedia.heroImages[0] || '', updatedAt });
      return true;
    });
    return saved ? res.status(200).json({ saved: true }) : res.status(404).json({ error: 'Listing not found.' });
  });
}
