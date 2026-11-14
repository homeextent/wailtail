import type { Firestore, Transaction, DocumentData } from 'firebase-admin/firestore';

/** Shared server-time guard for dealer-attributed seller mutations; private sellers are unchanged. */
export async function dealerListingEligible(transaction: Transaction, firestore: Firestore, listing: DocumentData, uid: string, now = Date.now()) {
  if (listing.sellerType !== 'dealer' && !listing.dealerId) return true;
  if (typeof listing.dealerId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(listing.dealerId)) return false;
  const [dealer, user, bidder] = await Promise.all([
    firestore.collection('dealer_profiles').doc(listing.dealerId), firestore.collection('users').doc(uid),
    firestore.collection('bidders').doc(uid)
  ].map(ref => transaction.get(ref)));
  const profile = dealer.data();
  return profile?.verificationStatus === 'verified' && Number.isSafeInteger(profile.verificationExpiresAt) &&
    profile.verificationExpiresAt > now && profile.primaryRepresentativeUid === uid && listing.sellerId === uid &&
    user.data()?.dealerId === listing.dealerId && bidder.data()?.dealerId === listing.dealerId;
}
