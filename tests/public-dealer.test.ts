import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicDealerSummary, readPublicDealerProfiles } from '../server/api/_lib/publicDealer';
import { projectPublicAuction } from '../server/api/public-auctions';
import { dealerPromoText } from '../src/utils/dealerPresentation';
const now = 2000;
const profile = { verificationStatus: 'verified', verificationExpiresAt: 3000, primaryRepresentativeUid: 'rep', phone: '+1 905 555 0100', website: 'https://example.test', displayPhonePublicly: true, displayWebsitePublicly: true, streetAddress: 'SECRET', dealerLicenseNumber: 'SECRET' };
const listing = { status: 'active', sellerType: 'dealer', dealerId: 'dealer', sellerId: 'rep', dealerDocFee: 0, taxHandling: 'dealer_collects', taxDisclaimerVersion: 'dealer-tax-v1', sourceApplicationId: 'SECRET', sourceApplicationCollection: 'consignment_applications', dealerListingRevision: 0, dealerSnapshot: { dealerId: 'dealer', dealershipName: 'Synthetic legal', displayName: 'Synthetic dealer', city: 'Toronto', province: 'ON', verifiedAt: 1000, verificationRecordVersion: '3', phone: profile.phone, website: profile.website, streetAddress: 'SECRET', dealerLicenseNumber: 'SECRET', representativeUid: 'SECRET' } };
test('public dealer projection is a dedicated allowlist and never exposes private provenance', () => {
  const result = publicDealerSummary(listing, profile, now)!;
  assert.deepEqual(Object.keys(result).sort(), ['name','city','province','verified','documentationFee','taxHandling','phone','website'].sort());
  assert.equal(result.verified, true); assert.equal(result.documentationFee, 0);
  const publicLot = projectPublicAuction('lot', listing, { ...profile, verificationExpiresAt: Date.now() + 100000 });
  assert.ok(publicLot?.publicDealer); assert.ok(!JSON.stringify(publicLot).includes('SECRET'));
  assert.equal(publicLot?.sellerId, undefined); assert.equal(publicLot?.dealerId, undefined);
  assert.equal(projectPublicAuction('draft', { ...listing, status: 'draft' }, profile), null);
});
test('verification and contacts fail closed on expiry, suspension, missing profile and representative mismatch', () => {
  for (const p of [undefined, { ...profile, verificationStatus: 'suspended' }, { ...profile, verificationExpiresAt: now }, { ...profile, primaryRepresentativeUid: 'different' }]) {
    const result = publicDealerSummary(listing, p, now)!;
    assert.equal(result.name, 'Synthetic dealer'); assert.equal(result.verified, false);
    assert.equal(result.phone, undefined); assert.equal(result.website, undefined);
    assert.ok(!dealerPromoText(result, 'Vehicle', 'https://example.test/lot').includes('Verified Boutique Dealer'));
  }
});
test('consent revocation and changed contacts cannot publish a different value or refresh historical snapshots', () => {
  for (const p of [{ ...profile, displayPhonePublicly: false, displayWebsitePublicly: false }, { ...profile, phone: 'new', website: 'https://new.test' }]) {
    const result = publicDealerSummary(listing, p, now)!;
    assert.equal(result.phone, undefined); assert.equal(result.website, undefined);
  }
  const noSnapshotContacts = { ...listing, dealerSnapshot: { ...listing.dealerSnapshot, phone: undefined, website: undefined } };
  assert.equal(publicDealerSummary(noSnapshotContacts, profile, now)?.website, undefined);
  for (const url of ['javascript:alert(1)', 'http://example.test', 'https://user:password@example.test', 'bad']) {
    const result = publicDealerSummary({ ...listing, dealerSnapshot: { ...listing.dealerSnapshot, website: url } }, { ...profile, website: url }, now);
    assert.equal(result?.website, undefined);
  }
});
test('private and malformed dealer lots never gain dealer claims; tax display uses known version', () => {
  assert.equal(publicDealerSummary({ ...listing, sellerType: 'private' }, profile, now), undefined);
  assert.equal(publicDealerSummary({ ...listing, sourceApplicationCollection: undefined }, profile, now), undefined, 'legacy snapshots have no inferred creation-time consent');
  assert.equal(publicDealerSummary({ ...listing, dealerSnapshot: {} }, profile, now), undefined);
  assert.equal(publicDealerSummary({ ...listing, taxDisclaimerVersion: 'unknown' }, profile, now)?.taxHandling, undefined);
  const text = dealerPromoText(publicDealerSummary(listing, profile, now), 'Vehicle', 'https://example.test/lot');
  assert.ok(text.includes('Verified Boutique Dealer')); assert.ok(text.includes('not provincial regulatory endorsement'));
});
test('profile reads deduplicate dealer IDs and fail closed without dropping public lots', async () => {
  let reads = 0;
  const db = { collection: () => ({ doc: (id: string) => id }), getAll: async (...ids: string[]) => { reads += ids.length; return ids.map(id => ({ id, exists: true, data: () => profile })); } };
  assert.equal((await readPublicDealerProfiles(db, [listing, listing])).size, 1); assert.equal(reads, 1);
  assert.equal((await readPublicDealerProfiles({ ...db, getAll: async () => { throw Error('unavailable'); } }, [listing])).size, 0);
});
