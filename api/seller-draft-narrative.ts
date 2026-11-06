import { getFirebaseAdminServices, type FirebaseAdminServices } from './_lib/firebaseAdmin';

const MAX_HEADING_LENGTH = 240;
const MAX_PARAGRAPHS = 40;
const MAX_PARAGRAPH_LENGTH = 4000;

export function parseDraftNarrative(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['auctionId', 'expectedRevision', 'overviewHeading', 'overviewParagraphs'].includes(key))) {
    return null;
  }
  const { auctionId, expectedRevision, overviewHeading, overviewParagraphs } = input;
  if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ||
      typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER ||
      typeof overviewHeading !== 'string' || overviewHeading.length > MAX_HEADING_LENGTH ||
      !Array.isArray(overviewParagraphs) || overviewParagraphs.length > MAX_PARAGRAPHS ||
      overviewParagraphs.some(value => typeof value !== 'string' || value.length > MAX_PARAGRAPH_LENGTH)) {
    return null;
  }

  return { auctionId, expectedRevision, overviewHeading, overviewParagraphs };
}

export function checkDraftNarrativeWrite(
  auction: { sellerId?: unknown; status?: unknown; sellerDraftRevision?: unknown } | undefined,
  uid: string,
  expectedRevision: number
) {
  if (!auction || auction.sellerId !== uid) return 404;
  if (auction.status !== 'draft' || (auction.sellerDraftRevision ?? 0) !== expectedRevision) return 409;
  return 200;
}

export async function handleSellerDraftNarrative(
  req: any,
  res: any,
  services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  const bearer = typeof req.headers?.authorization === 'string'
    ? /^Bearer ([^\s]+)$/i.exec(req.headers.authorization)
    : null;
  if (!bearer) return res.status(401).json({ error: 'unauthorized' });

  const input = parseDraftNarrative(req.body);
  if (!input) return res.status(422).json({ error: 'invalid-draft-narrative' });

  try {
    const { auth, firestore } = services ?? getFirebaseAdminServices();
    let uid: string;
    try {
      const token = await auth.verifyIdToken(bearer[1], true);
      if (!token.uid || token.email_verified !== true) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      uid = token.uid;
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const auctionRef = firestore.collection('auctions').doc(input.auctionId);
    const mediaId = input.auctionId === 'wailtail-1978-porsche-911'
      ? 'main-media-config'
      : `media-${input.auctionId}`;
    const mediaRef = firestore.collection('settings').doc(mediaId);
    const status = await firestore.runTransaction(async transaction => {
      const auction = await transaction.get(auctionRef);
      const decision = checkDraftNarrativeWrite(auction.data(), uid, input.expectedRevision);
      if (decision !== 200) return decision;

      const updatedAt = Date.now();
      transaction.set(mediaRef, {
        overviewHeading: input.overviewHeading,
        overviewParagraphs: input.overviewParagraphs,
        updatedAt
      }, { merge: true });
      transaction.update(auctionRef, {
        sellerDraftRevision: input.expectedRevision + 1,
        updatedAt
      });
      return 200;
    });

    if (status === 404) return res.status(404).json({ error: 'draft-not-found' });
    if (status === 409) return res.status(409).json({ error: 'draft-state-or-revision-conflict' });
    return res.status(200).json({ revision: input.expectedRevision + 1 });
  } catch {
    return res.status(503).json({ error: 'draft-write-unavailable' });
  }
}

export default function handler(req: any, res: any) {
  return handleSellerDraftNarrative(req, res);
}
