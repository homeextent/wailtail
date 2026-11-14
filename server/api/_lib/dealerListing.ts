import type { DocumentData, Firestore, Transaction } from 'firebase-admin/firestore';
import { dealerListingEligible } from './dealerEligibility.js';
import { DEALER_TAX_DISCLAIMER_VERSION } from '../../../src/config/dealerListing.js';

export function dealerSnapshot(profile: DocumentData, dealerId: string, revision: number) {
  if (!profile.legalBusinessName || !profile.city || !profile.province || !Number.isSafeInteger(profile.verifiedAt)) return null;
  return { dealerId, dealershipName: profile.legalBusinessName, displayName: profile.dbaName || profile.legalBusinessName,
    ...(profile.dbaName ? { dbaName: profile.dbaName } : {}), city: profile.city, province: profile.province,
    ...(profile.displayPhonePublicly === true && profile.phone ? { phone: profile.phone } : {}),
    ...(profile.displayWebsitePublicly === true && profile.website ? { website: profile.website } : {}),
    verifiedAt: profile.verifiedAt, verificationRecordVersion: String(revision) };
}

export async function dealerPublicationEligible(tx: Transaction, db: Firestore, listing: DocumentData) {
  if (listing.sellerType !== 'dealer' && !listing.dealerId) return true;
  const snapshot = listing.dealerSnapshot;
  return listing.sellerType === 'dealer' && listing.dealerDocFee === 0 &&
    listing.taxDisclaimerVersion === DEALER_TAX_DISCLAIMER_VERSION &&
    ['dealer_collects', 'buyer_pays_at_registration'].includes(listing.taxHandling) &&
    snapshot?.dealerId === listing.dealerId && typeof snapshot.dealershipName === 'string' &&
    await dealerListingEligible(tx, db, listing, listing.sellerId);
}
