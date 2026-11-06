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

async function handleSellerDraftCommand(
  req: any,
  res: any,
  services: Pick<FirebaseAdminServices, 'auth' | 'firestore'> | undefined,
  submit: boolean
) {
  return withSellerDraftRequest(req, res, services, async ({ firestore }, uid) => {
    const input = submit ? parseDraftSubmission(req.body) : parseDraftNarrative(req.body);
    if (!input) return res.status(422).json({ error: 'invalid-draft-request' });
    const auctionRef = firestore.collection('auctions').doc(input.auctionId);
    const mediaRef = firestore.collection('settings').doc(draftMediaId(input.auctionId));
    const status = await firestore.runTransaction(async transaction => {
      const auction = await transaction.get(auctionRef);
      const record = auction.data();
      const decision = checkDraftNarrativeWrite(record, uid, input.expectedRevision);
      if (decision !== 200) return decision;

      const updatedAt = Date.now();
      if (submit) {
        if (!record || !hasReviewIdentity(record)) return 422;
        const revision = input.expectedRevision + 1;
        const event = firestore.collection('auctionReviewOutbox').doc(auctionRef.id).collection('events').doc(String(revision));
        transaction.create(event, {
          type: 'listing_submitted_for_review', auctionId: input.auctionId, sellerId: uid,
          revision, status: 'queued', createdAt: updatedAt
        });
        transaction.update(auctionRef, { status: 'pending_review', sellerDraftRevision: revision, updatedAt });
        return 200;
      }
      if (!('overviewHeading' in input)) return 422;
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
    if (status === 422) return res.status(422).json({ error: 'incomplete-draft' });
    return res.status(200).json({ revision: input.expectedRevision + 1, ...(submit ? { status: 'pending_review' } : {}) });
  });
}

function parseDraftSubmission(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => key !== 'auctionId' && key !== 'expectedRevision')) return null;
  const parsed = parseDraftNarrative({ ...input, overviewHeading: '', overviewParagraphs: [] });
  return parsed && { auctionId: parsed.auctionId, expectedRevision: parsed.expectedRevision };
}

function hasReviewIdentity(record: Record<string, unknown>) {
  return ['title', 'make', 'model'].every(key => typeof record[key] === 'string' && String(record[key]).trim().length > 0) &&
    (typeof record.year === 'number' ? Number.isInteger(record.year) && record.year > 0 :
      typeof record.year === 'string' && /^\d{4}$/.test(record.year.trim()));
}

export function handleSellerDraftNarrative(req: any, res: any, services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>) {
  return handleSellerDraftCommand(req, res, services, false);
}

export function handleSellerDraftSubmission(req: any, res: any, services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>) {
  return handleSellerDraftCommand(req, res, services, true);
}

export async function withSellerDraftRequest(
  req: any,
  res: any,
  services: Pick<FirebaseAdminServices, 'auth' | 'firestore'> | undefined,
  execute: (services: Pick<FirebaseAdminServices, 'auth' | 'firestore'>, uid: string) => Promise<unknown>
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

  try {
    const resolved = services ?? getFirebaseAdminServices();
    let uid: string;
    try {
      const token = await resolved.auth.verifyIdToken(bearer[1], true);
      if (!token.uid || token.email_verified !== true) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      uid = token.uid;
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
    return await execute(resolved, uid);
  } catch {
    return res.status(503).json({ error: 'draft-operation-unavailable' });
  }
}

export function handleSellerDraftRead(req: any, res: any, services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>) {
  return withSellerDraftRequest(req, res, services, async ({ firestore }, uid) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || typeof body.auctionId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,160}$/.test(body.auctionId)) {
      return res.status(422).json({ error: 'invalid-draft-request' });
    }

    const auctionId: string = body.auctionId;
    const auctionRef = firestore.collection('auctions').doc(auctionId);
    const mediaRef = firestore.collection('settings').doc(draftMediaId(auctionId));
    const draft = await firestore.runTransaction(async transaction => {
      const record = (await transaction.get(auctionRef)).data();
      if (!record || record.sellerId !== uid ||
          (record.status !== 'draft' && record.status !== 'pending_review')) return null;

      const media = (await transaction.get(mediaRef)).data();
      const assets = await transaction.get(auctionRef.collection('draftAssets').where('removedAt', '==', null).limit(100));
      return {
        assetIds: assets.docs.sort((a, b) => Number(a.get('createdAt')) - Number(b.get('createdAt'))).map(asset => asset.id),
        auctionId,
        status: record.status,
        revision: record.sellerDraftRevision ?? 0,
        title: typeof record.title === 'string' ? record.title : '',
        overviewHeading: typeof media?.overviewHeading === 'string' ? media.overviewHeading : '',
        overviewParagraphs: Array.isArray(media?.overviewParagraphs)
          ? media.overviewParagraphs.filter(value => typeof value === 'string')
          : []
      };
    }, { readOnly: true });

    if (!draft) return res.status(404).json({ error: 'draft-not-found' });
    return res.status(200).json(draft);
  });
}

function draftMediaId(auctionId: string) {
  return auctionId === 'wailtail-1978-porsche-911' ? 'main-media-config' : `media-${auctionId}`;
}

export default function handler(req: any, res: any) {
  return handleSellerDraftNarrative(req, res);
}
