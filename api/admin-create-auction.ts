import { isDesignatedAdminEmail } from '../src/config/adminConfig';
import { withSellerDraftRequest } from './seller-draft-narrative';

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, _uid, email) => {
    if (!isDesignatedAdminEmail(email)) {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
    const input = req.body;
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== 1 || typeof input.title !== 'string' || input.title.length > 160) {
      return res.status(422).json({ error: 'Invalid listing title.' });
    }
    const title = input.title.trim() || 'New Vehicle Listing';
    const id = firestore.collection('auctions').doc().id;
    const now = Date.now();
    const auction = {
      id, title, subtitle: '', headline: '', make: '', model: '', year: '', vin: '',
      mileage: '', distanceUnit: 'km', leadHeroImage: '', heroImages: [],
      highlightsBadge: '', hagertyValuationUrl: '', watchCount: 0, location: '',
      sellerName: '', engine: '', drivetrain: '', exteriorColor: '', interior: '',
      titleStatus: '', currency: 'CAD', startTime: now, endTime: now + 604800000,
      startingBid: 1000, minimumIncrement: 250, currentBid: 1000, reserveAmount: 0,
      isReserveMet: true, bidCount: 0, highBidderId: '', highBidderName: '',
      highBidderEmail: '', status: 'draft', createdAt: now, updatedAt: now
    };
    const media = {
      vehicleName: title, heroImages: [], overviewHeading: '', overviewParagraphs: [],
      overviewImage: { url: '', caption: '', alt: '' }, overviewSpecs: [],
      inlineShowcase: [], fullGallery: [], youtubePlaylistUrl: '', videoTitle: '',
      videoSubtitle: '', videoChapters: []
    };
    const batch = firestore.batch();
    batch.create(firestore.collection('auctions').doc(id), auction);
    batch.create(firestore.collection('settings').doc(`media-${id}`), media);
    await batch.commit();
    return res.status(201).json({ auction });
  });
}
