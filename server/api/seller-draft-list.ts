import { withSellerDraftRequest } from './seller-draft-narrative';

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, uid) => {
    const snapshot = await firestore.collection('auctions').where('sellerId', '==', uid).get();
    const listings = snapshot.docs.map(doc => {
      const auction = doc.data();
      return {
        auctionId: doc.id,
        title: typeof auction.title === 'string' ? auction.title : 'Untitled Listing',
        heroImage: '',
        status: auction.status || 'preview',
        currentBid: Number(auction.currentBid || auction.startingBid || 0),
        bidCount: Number(auction.bidCount || 0),
        currency: auction.currency === 'USD' ? 'USD' : 'CAD',
        draftEditUrl: `/dashboard/listings/${encodeURIComponent(doc.id)}/edit`,
        endTime: Number(auction.endTime || 0),
        startTime: Number(auction.startTime || 0)
      };
    });
    listings.sort((a, b) => b.startTime - a.startTime);
    return res.status(200).json({ listings });
  });
}
