import { publicDealerSummary, readPublicDealerProfiles } from './_lib/publicDealer.js';
import { getFirebaseAdminServices } from './_lib/firebaseAdmin.js';

const PUBLIC_STATUSES = ['preview', 'upcoming', 'active', 'live', 'ending_soon', 'ended', 'sold', 'reserve_not_met'];

const TEXT_FIELDS = [
  'title', 'subtitle', 'headline', 'siteLogo', 'siteName', 'siteTagline', 'make', 'model',
  'generation', 'vin', 'mileage', 'location', 'locationCity', 'locationProvince',
  'locationCountry', 'engine', 'drivetrain', 'exteriorColor', 'interior', 'titleStatus',
  'currency', 'distanceUnit', 'leadHeroImage', 'highlightsBadge', 'hagertyValuationUrl',
  'serviceRecordsUrl'
] as const;

const NUMBER_FIELDS = [
  'watchCount', 'startTime', 'endTime', 'startingBid', 'minimumIncrement', 'currentBid',
  'bidCount', 'createdAt', 'updatedAt'
] as const;

export function projectPublicAuction(id: string, record: Record<string, unknown>, dealerProfile?: Record<string, any> | null) {
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
  const dealer = publicDealerSummary(record, dealerProfile);
  if (dealer) result.publicDealer = dealer;
  return result;
}


function select(record: unknown, fields: readonly string[]) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  const source = record as Record<string, unknown>;
  return Object.fromEntries(fields.flatMap(field => {
    const value = source[field];
    return typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ? [[field, value]] : [];
  }));
}

function entries(value: unknown, project: (entry: Record<string, unknown>) => unknown) {
  return Array.isArray(value)
    ? value.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry)).map(project)
    : [];
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter(entry => typeof entry === 'string') : [];
}

const imageFields = ['url', 'caption', 'alt', 'aspect'];

export function projectPublicMedia(record: Record<string, unknown>) {
  return {
    ...select(record, ['siteLogo', 'siteName', 'siteTagline', 'highlightsBadge', 'distanceUnit',
      'vehicleName', 'overviewHeading', 'youtubePlaylistUrl', 'videoTitle', 'videoSubtitle']),
    overviewParagraphs: strings(record.overviewParagraphs),
    ...(record.overviewImage ? { overviewImage: select(record.overviewImage, imageFields) } : {}),
    overviewSpecs: entries(record.overviewSpecs, entry => select(entry, ['label', 'value'])),
    heroImages: strings(record.heroImages),
    videoChapters: entries(record.videoChapters, entry => select(entry, ['id', 'title', 'url', 'videoUrl', 'youtubeUrl', 'description', 'startTime'])),
    inlineShowcase: entries(record.inlineShowcase, entry => ({
      ...select(entry, ['id', 'title', 'tagline']),
      paragraphs: strings(entry.paragraphs), bulletPoints: strings(entry.bulletPoints),
      specs: entries(entry.specs, spec => select(spec, ['label', 'value'])),
      images: entries(entry.images, image => select(image, imageFields))
    })),
    showcaseChapters: entries(record.showcaseChapters, entry => ({
      ...select(entry, ['id', 'category', 'title', 'subtitle', 'narrative', 'photoUrl', 'photoCaption']),
      highlights: strings(entry.highlights),
      specCards: entries(entry.specCards, spec => select(spec, ['id', 'key', 'value', 'isCustomKey']))
    })),
    fullGallery: entries(record.fullGallery, entry => select(entry,
      ['id', 'url', 'thumbnailUrl', 'category', 'title', 'caption', 'isPdf', 'fileSize', 'order']))
  };
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
    const { firestore, auth } = getFirebaseAdminServices();
    const auctions = firestore.collection('auctions');
    if (typeof id === 'string') {
      const snapshot = await auctions.doc(id).get();
      const data = snapshot.data();
      const profiles = data ? await readPublicDealerProfiles(firestore, [data]) : new Map();
      const auction = data && projectPublicAuction(snapshot.id, data, profiles.get(data.dealerId));
      if (!auction) return res.status(404).json({ error: 'auction-not-found' });
      const bearer = typeof req.headers?.authorization === 'string'
        ? /^Bearer ([^\s]+)$/i.exec(req.headers.authorization) : null;
      const viewer = bearer ? await auth.verifyIdToken(bearer[1], true).catch(() => null) : null;
      const viewerUid = viewer?.email_verified === true ? viewer.uid : undefined;
      if (viewerUid && viewerUid === data?.sellerId) auction.sellerId = viewerUid;
      const mediaId = id === 'wailtail-1978-porsche-911' ? 'main-media-config' : `media-${id}`;
      const [mediaSnapshot, bidSnapshot, commentSnapshot] = await Promise.all([
        firestore.collection('settings').doc(mediaId).get(),
        firestore.collection('bids').where('auctionId', '==', id).get(),
        firestore.collection('comments').where('auctionId', '==', id).get()
      ]);
      const media = mediaSnapshot.data();
      const bids = bidSnapshot.docs.map(doc => ({
        ...select(doc.data(), ['amount', 'bidderName', 'bidderHandle', 'timestamp', 'antiSniped', 'status']),
        id: doc.id, auctionId: id
      })).sort((a, b) => Number('amount' in b ? b.amount : 0) - Number('amount' in a ? a.amount : 0));
      const comments = commentSnapshot.docs.map(doc => ({
        ...(viewerUid && doc.get('userId') === viewerUid ? { userId: viewerUid } : {}),
        ...(viewerUid && Array.isArray(doc.get('upvotedBy')) && doc.get('upvotedBy').includes(viewerUid)
          ? { upvotedBy: [viewerUid] } : {}),
        ...select(doc.data(), ['userName', 'userBadge', 'text', 'timestamp', 'upvotes', 'replyToId',
          'isBid', 'bidAmount', 'isEdited', 'editedAt', 'isPinned', 'pinnedAt']),
        id: doc.id, auctionId: id
      })).sort((a, b) => Number('timestamp' in a ? a.timestamp : 0) - Number('timestamp' in b ? b.timestamp : 0));
      return res.status(200).json({ auction, media: media ? projectPublicMedia(media) : null, bids, comments });
    }
    const snapshot = await auctions.where('status', 'in', PUBLIC_STATUSES).get();
    const profiles = await readPublicDealerProfiles(firestore, snapshot.docs.map(doc => doc.data()));
    return res.status(200).json({
      auctions: snapshot.docs.map(doc => projectPublicAuction(doc.id, doc.data(), profiles.get(doc.get('dealerId')))).filter(Boolean)
    });
  } catch {
    return res.status(503).json({ error: 'catalog-unavailable' });
  }
}
