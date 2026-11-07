import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { isDesignatedAdminEmail } from '../../src/config/adminConfig.js';
import { getFirebaseAdminServices } from './_lib/firebaseAdmin.js';
import { withSellerDraftRequest } from './seller-draft-narrative.js';

const MAX_BYTES = 2 * 1024 * 1024;
const publicStatuses = new Set(['preview', 'upcoming', 'active', 'live', 'ending_soon', 'ended', 'sold', 'reserve_not_met']);

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, _uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'Administrator access required.' });
    const { auctionId, dataUrl } = req.body ?? {};
    if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ||
        typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(MAX_BYTES / 3) * 4 + 40) {
      return res.status(422).json({ error: 'Invalid or oversized image.' });
    }
    const image = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!image) return res.status(422).json({ error: 'Use a JPEG, PNG, or WebP image.' });
    const [, format, encoded] = image;
    const bytes = Buffer.from(encoded, 'base64');
    const valid = format === 'jpeg'
      ? bytes.length >= 5 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) &&
        bytes.subarray(-2).equals(Buffer.from([255, 217]))
      : format === 'png'
        ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid || bytes.length > MAX_BYTES || bytes.toString('base64') !== encoded) {
      return res.status(422).json({ error: 'Invalid or oversized image.' });
    }

    const listing = await firestore.collection('auctions').doc(auctionId).get();
    if (!listing.exists) return res.status(404).json({ error: 'Listing not found.' });
    if (!publicStatuses.has(listing.get('status'))) {
      return res.status(409).json({ error: 'Public image upload requires a published listing.' });
    }
    const bucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
    if (!bucket) return res.status(503).json({ error: 'Auction storage is unavailable.' });
    const path = `auctionPublic/${auctionId}/${randomUUID()}.${format === 'jpeg' ? 'jpg' : format}`;
    await getStorage(getFirebaseAdminServices().app).bucket(bucket).file(path).save(bytes, {
      resumable: false, contentType: `image/${format}`, preconditionOpts: { ifGenerationMatch: 0 }
    });
    const emulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    const origin = emulator ? `http://${emulator}` : 'https://firebasestorage.googleapis.com';
    return res.status(201).json({ url: `${origin}/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}?alt=media` });
  });
}
