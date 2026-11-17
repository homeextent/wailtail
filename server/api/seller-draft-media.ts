import { parseImagePlacement } from './_lib/draftImagePlacement.js';
import { isDesignatedAdminEmail } from '../../src/config/adminConfig.js';
import { dealerListingEligible } from './_lib/dealerEligibility.js';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdminServices, type FirebaseAdminServices } from './_lib/firebaseAdmin.js';
import { checkDraftNarrativeWrite, draftMediaId, withSellerDraftRequest } from './seller-draft-narrative.js';

export function handleSellerDraftMedia(req: any, res: any, services?: FirebaseAdminServices) {
  return withSellerDraftRequest(req, res, services, async ({ firestore }, uid, email) => {
    const admin = isDesignatedAdminEmail(email);
    const input = req.body;
    if (input?.action === 'reorder') {
      if (typeof input.auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.auctionId) ||
          !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= Number.MAX_SAFE_INTEGER ||
          !Array.isArray(input.assetIds) || input.assetIds.length > 100 ||
          !input.assetIds.every((id: unknown) => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) ||
          new Set(input.assetIds).size !== input.assetIds.length ||
          Object.keys(input).some(key => !['action', 'auctionId', 'expectedRevision', 'assetIds'].includes(key))) {
        return res.status(422).json({ error: 'invalid-image-order' });
      }
      const auction = firestore.collection('auctions').doc(input.auctionId);
      const decision = await firestore.runTransaction(async transaction => {
        const record = (await transaction.get(auction)).data();
        if (!record || (!admin && record.sellerId !== uid)) return 404;
        const access = checkDraftNarrativeWrite(record, admin ? record.sellerId : uid, input.expectedRevision);
        if (access !== 200) return access;
        if (!admin && !await dealerListingEligible(transaction, firestore, record, uid)) return 403;
        const active = await transaction.get(auction.collection('draftAssets').where('removedAt', '==', null).limit(101));
        const ids = new Set(active.docs.map(asset => asset.id));
        if (ids.size !== input.assetIds.length || !input.assetIds.every((id: string) => ids.has(id))) return 422;
        const now = Date.now();
        transaction.set(firestore.collection('settings').doc(draftMediaId(input.auctionId)), {
          sellerDraftGalleryOrder: input.assetIds, updatedAt: now
        }, { merge: true });
        transaction.update(auction, { sellerDraftRevision: input.expectedRevision + 1, updatedAt: now });
        return 200;
      });
      return res.status(decision).json(decision === 200 ? { revision: input.expectedRevision + 1 } : { error: 'draft-order-unavailable' });
    }
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        typeof input.auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.auctionId) ||
        typeof input.assetId !== 'string' || !/^[0-9a-f-]{36}$/.test(input.assetId) ||
        (input.action !== 'preview' && input.action !== 'remove' && input.action !== 'assign') ||
        Object.keys(input).some(key => !['auctionId', 'assetId', 'action', 'expectedRevision', 'placement', 'category'].includes(key))) {
      return res.status(422).json({ error: 'invalid-draft-media-request' });
    }

    const { auctionId, assetId, action, expectedRevision } = input;
    if (action !== 'preview' && (!Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER)) {
      return res.status(422).json({ error: 'invalid-draft-revision' });
    }
    const placement = parseImagePlacement(input);
    if (action === 'assign' && !placement) return res.status(422).json({ error: 'invalid-image-placement' });
    const auction = firestore.collection('auctions').doc(auctionId);
    const asset = auction.collection('draftAssets').doc(assetId);
    const objectPath = `auctionDraft/${auctionId}/${assetId}`;

    let contentType = 'image/jpeg';
    const decision = await firestore.runTransaction(async transaction => {
      const record = (await transaction.get(auction)).data();
      if (!record || (!admin && record.sellerId !== uid) ||
          (record.status !== 'draft' && record.status !== 'pending_review')) return 404;

      if (action !== 'preview') {
        const access = checkDraftNarrativeWrite(record, admin ? record.sellerId : uid, expectedRevision);
        if (access !== 200) return access;
        if (!admin && !await dealerListingEligible(transaction, firestore, record, uid)) return 403;
      }
      const metadata = (await transaction.get(asset)).data();
      if (!metadata || metadata.removedAt || metadata.objectPath !== objectPath) return 404;

      contentType = metadata.contentType || 'image/jpeg';
      if (action === 'assign' && contentType === 'application/pdf' && (placement?.placement !== 'gallery' || placement.category !== 'documentation')) return 422;
      if (action === 'assign') {
        transaction.update(asset, placement!);
        transaction.update(auction, { sellerDraftRevision: expectedRevision + 1, updatedAt: Date.now() });
      }
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

    if (decision === 422) return res.status(422).json({ error: action === 'remove' ? 'draft-image-assigned' : 'invalid-image-placement' });
    if (decision !== 200) return res.status(decision).json({ error: 'draft-media-unavailable' });
    if (action !== 'preview') return res.status(200).json({ revision: expectedRevision + 1 });

    const bucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
    if (!bucket) return res.status(503).json({ error: 'draft-storage-unconfigured' });
    const file = getStorage((services ?? getFirebaseAdminServices()).app).bucket(bucket).file(objectPath);
    const [bytes] = await file.download();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    if (contentType === 'application/pdf') res.setHeader('Content-Disposition', 'attachment; filename="inspection-report.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(bytes);
  });
}

export default function handler(req: any, res: any) {
  return handleSellerDraftMedia(req, res);
}
