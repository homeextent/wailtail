import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import { dealerPublicationEligible } from './dealerListing.js';
import { applyPublishedDraftImages } from './draftImagePlacement.js';
import { draftMediaId } from '../seller-draft-narrative.js';

export const publicationStatuses = new Set(['preview', 'upcoming', 'active', 'live', 'ending_soon', 'ended', 'sold', 'reserve_not_met']);

/** Called only after verified administrator authorization. Never publishes by a seller request. */
export async function prepareDraftImages(db: any, ids: string[], status: unknown) {
  const plans: any[] = [];
  const copies: any[] = [];
  let totalImages = 0;
  const attempt = randomUUID();
  const cleanup = async () => {
    for (const copy of copies) {
      // A transport error can follow a committed transaction. Reconcile before deleting.
      if ((await copy.assetRef.get()).get('publishedUrl') === copy.url) continue;
      let metadata;
      try { [metadata] = await copy.file.getMetadata(); }
      catch (error: any) { if (error.code === 404) continue; throw error; }
      if (metadata.metadata?.draftPublicationAttempt !== attempt) throw new Error('Publication copy ownership requires reconciliation.');
      await copy.file.delete({ ifGenerationMatch: metadata.generation });
    }
  };
  try {
    if (!publicationStatuses.has(String(status))) return { plans, cleanup };
    for (const id of ids) {
      const ref = db.collection('auctions').doc(id);
      const plan = await db.runTransaction(async (tx: any) => {
        const listing = await tx.get(ref);
        const record = listing.data();
        if (!record || !['draft', 'pending_review'].includes(record.status)) return null;
        if (!await dealerPublicationEligible(tx, db, record)) throw new Error('Dealer publication eligibility changed.');
        const mediaRef = db.collection('settings').doc(draftMediaId(id));
        const media = await tx.get(mediaRef);
        const assets = await tx.get(ref.collection('draftAssets').where('removedAt', '==', null).limit(101));
        if (assets.size > 100) throw new Error('Too many draft images.');
        if (assets.empty && !(media.get('draftPublishedUrls') || []).length) return null;
        return { ref, updateTime: listing.updateTime, mediaRef, mediaTime: media.updateTime,
          media: media.data() || {}, assets: assets.docs.map((asset: any) => ({ id: asset.id, ...asset.data() })),
          fingerprint: JSON.stringify(assets.docs.map((asset: any) => [asset.id, asset.updateTime.toMillis(), asset.data()])) };
      });
      if (!plan) continue;
      totalImages += plan.assets.length;
      if (totalImages > 100) throw new Error('Publish image-heavy drafts individually (maximum 100 images per request).');
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim();
      if (!bucketName) throw new Error('Draft storage is unconfigured.');
      const bucket = getStorage(getFirebaseAdminServices().app).bucket(bucketName);
      let nextImage = 0;
      const copyImage = async (asset: any) => {
        if (!/^[0-9a-f-]{36}$/.test(asset.id) || asset.objectPath !== `auctionDraft/${id}/${asset.id}`) throw new Error('Invalid draft image reference.');
        const [bytes] = await bucket.file(asset.objectPath).download();
        if (bytes.length < 5 || bytes.length > 2 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) throw new Error('Invalid draft image bytes.');
        const path = `auctionPublic/${id}/${randomUUID()}.jpg`;
        const file = bucket.file(path);
        // Register intent before the write so an ambiguous Storage response can be reconciled.
        // The attempt marker and generation guard prevent deleting another writer's object.
        const origin = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}` : 'https://firebasestorage.googleapis.com';
        asset.previousPublishedUrl = asset.publishedUrl;
        asset.publishedUrl = `${origin}/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media`;
        copies.push({ file, assetRef: ref.collection('draftAssets').doc(asset.id), url: asset.publishedUrl });
        await file.save(bytes, { resumable: false, contentType: 'image/jpeg',
          metadata: { metadata: { draftPublicationAttempt: attempt } }, preconditionOpts: { ifGenerationMatch: 0 } });
      };
      const results = await Promise.allSettled(Array.from({ length: Math.min(4, plan.assets.length) }, async () => {
        while (nextImage < plan.assets.length) await copyImage(plan.assets[nextImage++]);
      }));
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      plans.push(plan);
    }
    return { plans, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

export async function checkDraftImagePlans(tx: any, plans: any[]) {
  for (const plan of plans) {
    const current = await tx.get(plan.ref);
    const media = await tx.get(plan.mediaRef);
    const assets = await tx.get(plan.ref.collection('draftAssets').where('removedAt', '==', null).limit(101));
    if (!current.updateTime?.isEqual(plan.updateTime) ||
        Boolean(media.updateTime) !== Boolean(plan.mediaTime) || (media.updateTime && !media.updateTime.isEqual(plan.mediaTime)) ||
        JSON.stringify(assets.docs.map((asset: any) => [asset.id, asset.updateTime.toMillis(), asset.data()])) !== plan.fingerprint) {
      throw new Error('Draft images changed during publication. Reload and retry.');
    }
  }
}

export function writeDraftImagePlans(tx: any, plans: any[]) {
  for (const plan of plans) {
    const media = applyPublishedDraftImages(plan.media, plan.assets);
    tx.set(plan.mediaRef, { ...media, updatedAt: Date.now() }, { merge: true });
    for (const asset of plan.assets) tx.update(plan.ref.collection('draftAssets').doc(asset.id), { publishedUrl: asset.publishedUrl });
    tx.update(plan.ref, { heroImages: media.heroImages, leadHeroImage: media.heroImages[0] || '' });
  }
}
