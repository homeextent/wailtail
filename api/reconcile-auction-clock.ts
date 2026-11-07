import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdminServices } from './_lib/firebaseAdmin';
import { settleAuction } from './admin-settle-auction';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return res.status(503).json({ error: 'auction-worker-unconfigured' });
  const supplied = typeof req.headers?.authorization === 'string'
    ? Buffer.from(req.headers.authorization) : Buffer.alloc(0);
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const { firestore } = getFirebaseAdminServices();
    const now = Date.now();
    const snapshot = await firestore.collection('auctions')
      .where('status', 'in', ['upcoming', 'active', 'live', 'ending_soon']).get();
    const due = snapshot.docs.filter(doc => {
      const auction = doc.data();
      return Number.isFinite(auction.startTime) && Number.isFinite(auction.endTime) &&
        (now >= auction.endTime || (auction.status === 'upcoming' && now >= auction.startTime));
    }).sort((a, b) => Number(a.get('endTime')) - Number(b.get('endTime')) || a.id.localeCompare(b.id))
      .slice(0, 25);
    let processed = 0;
    let pending = 0;
    for (const doc of due) {
      try {
        const result = await settleAuction(firestore, doc.id, true);
        if (result >= 400 && result !== 409 && result !== 404) pending++;
        else processed++;
      } catch {
        pending++;
      }
    }
    return res.status(pending ? 503 : 200).json({
      processed, pending, remaining: Math.max(0, snapshot.docs.filter(doc => {
        const record = doc.data();
        return Number.isFinite(record.startTime) && Number.isFinite(record.endTime) &&
          (now >= record.endTime || record.status === 'upcoming' && now >= record.startTime);
      }).length - due.length)
    });
  } catch {
    return res.status(503).json({ error: 'auction-worker-unavailable' });
  }
}
