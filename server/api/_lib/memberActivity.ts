import type { Firestore } from 'firebase-admin/firestore';
import { projectPublicAuction } from '../public-auctions.js';

export async function readMemberActivity(firestore: Firestore, uid: string, email: string) {
  const [bids, wins, applications, legacy] = await Promise.all([
    firestore.collection('bids').where('bidderId', '==', uid).limit(500).get(),
    firestore.collection('auctions').where('highBidderId', '==', uid).limit(100).get(),
    firestore.collection('consignment_applications').where('sellerEmail', '==', email.toLowerCase()).limit(100).get(),
    firestore.collection('consignments').where('sellerEmail', '==', email.toLowerCase()).limit(100).get()
  ]);
  const ownBids = new Map<string, { amount: number; count: number }>();
  for (const doc of bids.docs) {
    const bid = doc.data();
    if (bid.status === 'retracted' || typeof bid.auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(bid.auctionId) ||
        !Number.isSafeInteger(bid.amount) || bid.amount < 0) continue;
    const previous = ownBids.get(bid.auctionId);
    ownBids.set(bid.auctionId, { amount: Math.max(previous?.amount ?? 0, bid.amount), count: (previous?.count ?? 0) + 1 });
  }
  const ids = [...new Set([...wins.docs.map(doc => doc.id), ...ownBids.keys()])].slice(0, 100);
  const lots = await Promise.all(ids.map(id => firestore.collection('auctions').doc(id).get()));
  const activeBids: any[] = [], wonAuctions: any[] = [];
  for (const snapshot of lots) {
    const data = snapshot.data();
    if (!data || !projectPublicAuction(snapshot.id, data)) continue;
    const common = { auctionId: snapshot.id, auctionTitle: typeof data.title === 'string' ? data.title : '',
      auctionHeroImage: typeof data.leadHeroImage === 'string' ? data.leadHeroImage : '',
      currency: 'CAD', endTime: Number(data.endTime) || 0 };
    if (data.status === 'sold' && data.highBidderId === uid) {
      wonAuctions.push({ ...common, winningBid: Number(data.currentBid) || 0,
        sellerName: data.sellerName || '', sellerEmail: data.sellerEmail || '', sellerPhone: data.sellerPhone || '',
        location: data.location || '', vin: data.vin || '' });
    } else if (['active', 'live', 'ending_soon'].includes(data.status) && data.endTime > Date.now() && ownBids.has(snapshot.id)) {
      const bid = ownBids.get(snapshot.id)!;
      activeBids.push({ ...common, currentHighBid: Number(data.currentBid) || 0, userHighestBid: bid.amount,
        status: data.highBidderId === uid ? 'LEADING' : 'OUTBID', bidCount: bid.count, isReserveMet: data.isReserveMet === true });
    }
  }
  const consignments = new Map<string, any>();
  for (const doc of [...legacy.docs, ...applications.docs]) {
    const data = doc.data();
    consignments.set(doc.id, { id: doc.id, year: data.year ?? '', make: data.make || '', model: data.model || '',
      generation: data.generation || '', submittedAt: data.submittedAt || data.timestamp || 0,
      status: String(data.status || 'pending').toUpperCase(),
      ...(typeof data.convertedAuctionId === 'string' ? { convertedAuctionId: data.convertedAuctionId } : {}) });
  }
  return { activeBids, wonAuctions, sellerListings: [], consignments: [...consignments.values()],
    historyLimitReached: bids.size >= 500 || wins.size >= 100 || applications.size >= 100 || legacy.size >= 100 ||
      new Set([...ownBids.keys(), ...wins.docs.map(doc => doc.id)]).size > 100 };
}
