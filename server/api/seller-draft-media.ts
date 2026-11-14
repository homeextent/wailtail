import { dealerListingEligible } from './_lib/dealerEligibility.js';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdminServices, type FirebaseAdminServices } from './_lib/firebaseAdmin.js';
import { checkDraftNarrativeWrite, draftMediaId, withSellerDraftRequest } from './seller-draft-narrative.js';

export function handleSellerDraftMedia(req: any, res: any, services?: FirebaseAdminServices) {
  return withSellerDraftRequest(req, res, services, async ({ firestore }, uid) => {
    const input = req.body;
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        typeof input.auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.auctionId) ||
        typeof input.assetId !== 'string' || !/^[0-9a-f-]{36}$/.test(input.assetId) ||
        (input.action !== 'preview' && input.action !== 'remove') ||
        Object.keys(input).some(key => !['auctionId', 'assetId', 'action', 'expectedRevision'].includes(key))) {
      return res.status(422).json({ error: 'invalid-draft-media-request' });
    }

    const { auctionId, assetId, action, expectedRevision } = input;
    if (action === 'remove' && (!Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER)) {
      return res.status(422).json({ error: 'invalid-draft-revision' });
    }
    const auction = firestore.collection('auctions').doc(auctionId);
    const asset = auction.collection('draftAssets').doc(assetId);
    const objectPath = `auctionDraft/${auctionId}/${assetId}`;

    const decision = await firestore.runTransaction(async transaction => {
      const record = (await transaction.get(auction)).data();
      if (!record || record.sellerId !== uid ||
          (record.status !== 'draft' && record.status !== 'pending_review')) return 404;

      if (action === 'remove') {
        const access = checkDraftNarrativeWrite(record, uid, expectedRevision);
        if (access !== 200) return access;
        if (!await dealerListingEligible(transaction, firestore, record, uid)) return 403;
      }
      const metadata = (await transaction.get(asset)).data();
      if (!metadata || metadata.removedAt || metadata.objectPath !== objectPath) return 404;

      if (action === 'remove') {
        const config = firestore.collection('settings').doc(draftMediaId(auctionId));
        const chapters = (await transaction.get(config)).get('showcaseChapters');
        if (Array.isArray(chapters) && chapters.some(chapter => chapter?.photoAssetId === assetId)) return 422;
        const now = Date.now();
        transaction.update(asset, { removedAt: now });
        transaction.update(auction, { sellerDraftRevision: expectedRevision + 1, updatedAt: now });
      }
      return 200;
    });

    if (decision === 422) return res.status(422).json({ error: 'draft-image-assigned' });
    if (decision !== 200) return res.status(decision).json({ error: 'draft-media-unavailable' });
    if (action === 'remove') return res.status(200).json({ revision: expectedRevision + 1 });

    const bucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
    if (!bucket) return res.status(503).json({ error: 'draft-storage-unconfigured' });
    const file = getStorage((services ?? getFirebaseAdminServices()).app).bucket(bucket).file(objectPath);
    const [bytes] = await file.download();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(bytes);
  });
}

export default function handler(req: any, res: any) {
  return handleSellerDraftMedia(req, res);
}
