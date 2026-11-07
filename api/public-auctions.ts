import { getFirebaseAdminServices } from './_lib/firebaseAdmin';

const PUBLIC_STATUSES = ['preview', 'upcoming', 'active', 'live', 'ending_soon', 'ended', 'sold', 'reserve_not_met'];

const TEXT_FIELDS = [
  'title', 'subtitle', 'headline', 'siteLogo', 'siteName', 'siteTagline', 'make', 'model',
  'generation', 'vin', 'mileage', 'location', 'locationCity', 'locationProvince',
  'locationCountry', 'engine', 'drivetrain', 'exteriorColor', 'interior', 'titleStatus',
  'currency', 'distanceUnit', 'leadHeroImage', 'highlightsBadge', 'hagertyValuationUrl'
] as const;

const NUMBER_FIELDS = [
  'watchCount', 'startTime', 'endTime', 'startingBid', 'minimumIncrement', 'currentBid',
  'bidCount', 'createdAt', 'updatedAt'
] as const;

export function projectPublicAuction(id: string, record: Record<string, unknown>) {
  const status = record.status;
  if (typeof status !== 'string' || !PUBLIC_STATUSES.includes(status)) return null;

  const result: Record<string, unknown> = { id, status, isReserveMet: record.isReserveMet === true };
  for (const field of TEXT_FIELDS) {
    if (typeof record[field] === 'string') result[field] = record[field];
  }
  for (const field of NUMBER_FIELDS) {
    if (typeof record[field] === 'number' && Number.isFinite(record[field])) result[field] = record[field];
  }
  if (typeof record.year === 'string' || (typeof record.year === 'number' && Number.isFinite(record.year))) {
    result.year = record.year;
  }
  if (Array.isArray(record.heroImages)) {
    result.heroImages = record.heroImages.filter((entry): entry is string => typeof entry === 'string');
  }
  return result;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  const id = req.query?.auctionId;
  if (id !== undefined && (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id))) {
    return res.status(422).json({ error: 'invalid-auction-id' });
  }
  try {
    const { firestore } = getFirebaseAdminServices();
    const auctions = firestore.collection('auctions');
    if (typeof id === 'string') {
      const snapshot = await auctions.doc(id).get();
      const data = snapshot.data();
      const auction = data && projectPublicAuction(snapshot.id, data);
      return auction
        ? res.status(200).json({ auction })
        : res.status(404).json({ error: 'auction-not-found' });
    }
    const snapshot = await auctions.where('status', 'in', PUBLIC_STATUSES).get();
    return res.status(200).json({
      auctions: snapshot.docs.map(doc => projectPublicAuction(doc.id, doc.data())).filter(Boolean)
    });
  } catch {
    return res.status(503).json({ error: 'catalog-unavailable' });
  }
}
