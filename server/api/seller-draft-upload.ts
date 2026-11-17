import { decodeDraftFile } from './_lib/draftFile.js';
import { parseImagePlacement } from './_lib/draftImagePlacement.js';
import { isDesignatedAdminEmail } from '../../src/config/adminConfig.js';
import { dealerListingEligible } from './_lib/dealerEligibility.js';
import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdminServices, type FirebaseAdminServices } from './_lib/firebaseAdmin.js';
import { checkDraftNarrativeWrite, withSellerDraftRequest } from './seller-draft-narrative.js';


function parseUpload(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['auctionId', 'expectedRevision', 'jpegBase64', 'fileBase64', 'contentType', 'title', 'placement', 'category'].includes(key))) return null;
  const { auctionId, expectedRevision } = input;
  if (input.jpegBase64 !== undefined && (input.fileBase64 !== undefined || input.contentType !== undefined)) return null;
  const file = decodeDraftFile(input.fileBase64 ?? input.jpegBase64, input.contentType ?? 'image/jpeg');
  if (!file || (input.title !== undefined && (typeof input.title !== 'string' || input.title.length > 180 || [...input.title].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)))) return null;
  const placement = parseImagePlacement(input);
  if (!placement) return null;
  if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ||
      typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) return null;
  if (file.contentType === 'application/pdf' && (placement.placement !== 'gallery' || placement.category !== 'documentation')) return null;
  return { auctionId, expectedRevision, ...file, ...placement, title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : file.contentType === 'application/pdf' ? 'Inspection report' : 'Vehicle photo' };
}

export function handleSellerDraftUpload(req: any, res: any, services?: FirebaseAdminServices) {
  return withSellerDraftRequest(req, res, services, async ({ firestore }, uid, email) => {
    const admin = isDesignatedAdminEmail(email);
    const input = parseUpload(req.body);
    if (!input) return res.status(422).json({ error: 'invalid-draft-image' });

    const auction = firestore.collection('auctions').doc(input.auctionId);
    const decision = await firestore.runTransaction(async transaction => {
      const record = (await transaction.get(auction)).data();
      const access = checkDraftNarrativeWrite(record, admin ? record?.sellerId : uid, input.expectedRevision);
      if (access !== 200) return access;
      return admin || await dealerListingEligible(transaction, firestore, record!, uid) ? 200 : 403;
    });
    if (decision !== 200) return res.status(decision).json({ error: 'draft-unavailable' });

    const activeAssets = auction.collection('draftAssets').where('removedAt', '==', null).limit(100);
    if ((await activeAssets.get()).size >= 100) {
      return res.status(409).json({ error: 'draft-image-limit' });
    }

    const bucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
    if (!bucket) return res.status(503).json({ error: 'draft-storage-unconfigured' });
    const assetId = randomUUID();
    const objectPath = `auctionDraft/${input.auctionId}/${assetId}`;
    const file = getStorage((services ?? getFirebaseAdminServices()).app).bucket(bucket).file(objectPath);
    await file.save(input.bytes, {
      resumable: false,
      contentType: input.contentType,
      metadata: { cacheControl: 'private, no-store', ...(input.contentType === 'application/pdf' ? { contentDisposition: 'attachment; filename="inspection-report.pdf"' } : {}) },
      preconditionOpts: { ifGenerationMatch: 0 }
    });

    // Storage and Firestore cannot share a transaction. An interrupted or
    // rejected write can leave a private unattached object for reconciliation.
    const status = await firestore.runTransaction(async transaction => {
      const record = (await transaction.get(auction)).data();
      const current = checkDraftNarrativeWrite(record, admin ? record?.sellerId : uid, input.expectedRevision);
      if (current !== 200) return current;
      if (!admin && !await dealerListingEligible(transaction, firestore, record!, uid)) return 403;

      if ((await transaction.get(activeAssets)).size >= 100) return 409;

      const now = Date.now();
      transaction.create(auction.collection('draftAssets').doc(assetId), {
        placement: input.placement, category: input.category, title: input.title, objectPath, contentType: input.contentType, byteLength: input.bytes.length, createdAt: now, removedAt: null
      });
      transaction.update(auction, { sellerDraftRevision: input.expectedRevision + 1, updatedAt: now });
      return 200;
    });

    if (status !== 200) return res.status(status).json({ error: 'draft-unavailable' });
    return res.status(201).json({ assetId, revision: input.expectedRevision + 1 });
  });
}

export default function handler(req: any, res: any) {
  return handleSellerDraftUpload(req, res);
}
