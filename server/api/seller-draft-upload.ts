import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdminServices, type FirebaseAdminServices } from './_lib/firebaseAdmin.js';
import { checkDraftNarrativeWrite, withSellerDraftRequest } from './seller-draft-narrative.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function parseUpload(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['auctionId', 'expectedRevision', 'jpegBase64'].includes(key))) return null;
  const { auctionId, expectedRevision, jpegBase64 } = input;
  if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ||
      typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER ||
      typeof jpegBase64 !== 'string' || jpegBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(jpegBase64)) return null;

  const bytes = Buffer.from(jpegBase64, 'base64');
  if (bytes.length < 5 || bytes.length > MAX_IMAGE_BYTES ||
      bytes.toString('base64') !== jpegBase64 ||
      bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;

  return { auctionId, expectedRevision, bytes };
}

export function handleSellerDraftUpload(req: any, res: any, services?: FirebaseAdminServices) {
  return withSellerDraftRequest(req, res, services, async ({ firestore }, uid) => {
    const input = parseUpload(req.body);
    if (!input) return res.status(422).json({ error: 'invalid-draft-image' });

    const auction = firestore.collection('auctions').doc(input.auctionId);
    const decision = checkDraftNarrativeWrite((await auction.get()).data(), uid, input.expectedRevision);
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
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'private, no-store' },
      preconditionOpts: { ifGenerationMatch: 0 }
    });

    // Storage and Firestore cannot share a transaction. An interrupted or
    // rejected write can leave a private unattached object for reconciliation.
    const status = await firestore.runTransaction(async transaction => {
      const current = checkDraftNarrativeWrite((await transaction.get(auction)).data(), uid, input.expectedRevision);
      if (current !== 200) return current;

      if ((await transaction.get(activeAssets)).size >= 100) return 409;

      const now = Date.now();
      transaction.create(auction.collection('draftAssets').doc(assetId), {
        objectPath, contentType: 'image/jpeg', byteLength: input.bytes.length, createdAt: now, removedAt: null
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
