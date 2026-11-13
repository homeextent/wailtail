import type { PublicDealerSummary } from '../../../src/types.js';
import { DEALER_TAX_DISCLAIMER_VERSION } from '../../../src/config/dealerListing.js';

const text = (value: unknown, max = 240) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
export function publicDealerSummary(listing: Record<string, any>, profile?: Record<string, any> | null, now = Date.now()): PublicDealerSummary | undefined {
  const s = listing.dealerSnapshot;
  if (listing.sourceApplicationCollection !== 'consignment_applications' ||
      typeof listing.sourceApplicationId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(listing.sourceApplicationId) ||
      !Number.isSafeInteger(listing.dealerListingRevision) || listing.dealerListingRevision < 0 ||
      listing.sellerType !== 'dealer' || typeof listing.dealerId !== 'string' || !s || s.dealerId !== listing.dealerId ||
      !text(s.dealershipName) || !text(s.displayName) || !text(s.city) || !text(s.province) ||
      !Number.isSafeInteger(s.verifiedAt) || s.verifiedAt <= 0 || typeof s.verificationRecordVersion !== 'string' || !/^[1-9][0-9]*$/.test(s.verificationRecordVersion)) return undefined;
  const verified = profile?.verificationStatus === 'verified' && Number.isSafeInteger(profile.verificationExpiresAt) &&
    profile.verificationExpiresAt > now && profile.primaryRepresentativeUid === listing.sellerId;
  const result: PublicDealerSummary = { name: text(s.displayName)!, city: text(s.city)!, province: text(s.province)!, verified: !!verified };
  if (listing.dealerDocFee === 0) result.documentationFee = 0;
  if (listing.taxDisclaimerVersion === DEALER_TAX_DISCLAIMER_VERSION && ['dealer_collects', 'buyer_pays_at_registration'].includes(listing.taxHandling)) result.taxHandling = listing.taxHandling;
  if (verified && profile?.displayPhonePublicly === true && s.phone === profile.phone &&
      typeof s.phone === 'string' && /^\+?[0-9 ()\-.]{7,40}$/.test(s.phone) && s.phone.replace(/\D/g, '').length >= 7) result.phone = s.phone;
  if (verified && profile?.displayWebsitePublicly === true && s.website === profile.website && text(s.website)) {
    try { const url = new URL(s.website); if (url.protocol === 'https:' && !url.username && !url.password) result.website = url.href; } catch { /* Omit unsafe URLs. */ }
  }
  return result;
}

/** One canonical read per unique dealer per response; a failed lookup fails closed for claims/contacts. */
export async function readPublicDealerProfiles(db: any, listings: Record<string, any>[]) {
  const ids = [...new Set(listings.filter(l => l.sellerType === 'dealer' && typeof l.dealerId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(l.dealerId)).map(l => l.dealerId as string))];
  const profiles = new Map<string, Record<string, any>>();
  for (let i = 0; i < ids.length; i += 100) {
    try { const docs = await db.getAll(...ids.slice(i, i + 100).map(id => db.collection('dealer_profiles').doc(id)));
      for (const doc of docs) if (doc.exists) profiles.set(doc.id, doc.data());
    } catch { /* Public lots remain available; no current verification assertion is made. */ }
  }
  return profiles;
}
