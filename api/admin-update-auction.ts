import { isDesignatedAdminEmail } from '../src/config/adminConfig';
import { withSellerDraftRequest } from './seller-draft-narrative';

const textFields = new Set([
  'title', 'subtitle', 'headline', 'siteLogo', 'siteName', 'siteTagline', 'highlightsBadge',
  'distanceUnit', 'make', 'model', 'generation', 'vin', 'mileage', 'location', 'sellerName',
  'engine', 'drivetrain', 'exteriorColor', 'interior', 'titleStatus', 'serviceRecordsUrl',
  'currency', 'leadHeroImage', 'hagertyValuationUrl', 'locationCity', 'locationProvince', 'locationCountry'
]);
const numbers = new Set(['reserveAmount', 'minimumIncrement', 'startingBid', 'startTime', 'endTime']);
const statuses = new Set(['draft', 'pending_review', 'preview', 'upcoming', 'active', 'live',
  'ending_soon', 'ended', 'sold', 'reserve_not_met']);

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, _uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'Administrator access required.' });
    const { auctionId, updates } = req.body ?? {};
    if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ||
        !updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(422).json({ error: 'Invalid listing update.' });
    }
    const patch: Record<string, string | number | boolean | string[]> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (textFields.has(key) && typeof value === 'string' && value.length <= 16384) patch[key] = value;
      else if (numbers.has(key) && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) patch[key] = value;
      else if (key === 'status' && typeof value === 'string' && statuses.has(value)) patch[key] = value;
      else if (key === 'isReserveMet' && typeof value === 'boolean') patch[key] = value;
      else if (key === 'year' && (typeof value === 'string' && value.length <= 16 || typeof value === 'number' && Number.isSafeInteger(value))) patch[key] = value;
      else if (key === 'heroImages' && Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string' && item.length <= 16384)) patch[key] = value;
      else return res.status(422).json({ error: 'Invalid or protected listing field.' });
    }
    if (!Object.keys(patch).length) return res.status(422).json({ error: 'No listing fields supplied.' });

    const ref = firestore.collection('auctions').doc(auctionId);
    const result = await firestore.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (!current) return null;
      const now = Date.now();
      const changed = { ...patch };
      if (changed.status === 'draft' && typeof current.endTime === 'number' && current.endTime > 0 &&
          now >= current.endTime && (Number(current.currentBid) > 0 || Number(current.bidCount) > 0)) {
        changed.status = current.isReserveMet || current.reserveAmount <= 0 || current.currentBid >= current.reserveAmount
          ? 'sold' : 'ended';
      }
      tx.update(ref, { ...changed, updatedAt: now });
      return { status: changed.status ?? current.status ?? null, winningEmailSent: current.winningEmailSent === true };
    });
    return result ? res.status(200).json(result) : res.status(404).json({ error: 'Listing not found.' });
  });
}
