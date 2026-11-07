import { getFirebaseAdminServices } from './_lib/firebaseAdmin';
import { settleAuction } from './admin-settle-auction';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 ||
      typeof body.auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(body.auctionId)) {
    return res.status(422).json({ error: 'invalid-auction-id' });
  }
  try {
    const { firestore } = getFirebaseAdminServices();
    // The caller supplies no state, clock, reserve, bidder, or notification data.
    const result = await settleAuction(firestore, body.auctionId, true);
    if (result >= 400) return res.status(result).json({ error: 'Auction clock has no available transition.' });
    return res.status(200).json({ success: true });
  } catch {
    return res.status(503).json({ error: 'Auction clock is temporarily unavailable.' });
  }
}
