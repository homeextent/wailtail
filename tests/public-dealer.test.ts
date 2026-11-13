import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicDealerSummary, readPublicDealerProfiles } from '../server/api/_lib/publicDealer';
import { projectPublicAuction } from '../server/api/public-auctions';
import { dealerPromoTemplates, dealerCampaignState } from '../src/utils/dealerPresentation';
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
    assert.ok(!dealerPromoTemplates(result, { title: 'Vehicle' }, 'upcoming', 'https://example.test/lot').enthusiast_forum.includes('Verified Boutique Dealer'));
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
  const text = dealerPromoTemplates(publicDealerSummary(listing, profile, now), { title: 'Vehicle' }, 'upcoming', 'https://example.test/lot').enthusiast_forum;
  assert.ok(text.includes('Verified Boutique Dealer')); assert.ok(text.includes('not provincial regulatory endorsement'));
});
test('profile reads deduplicate dealer IDs and fail closed without dropping public lots', async () => {
  let reads = 0;
  const db = { collection: () => ({ doc: (id: string) => id }), getAll: async (...ids: string[]) => { reads += ids.length; return ids.map(id => ({ id, exists: true, data: () => profile })); } };
  assert.equal((await readPublicDealerProfiles(db, [listing, listing])).size, 1); assert.equal(reads, 1);
  assert.equal((await readPublicDealerProfiles({ ...db, getAll: async () => { throw Error('unavailable'); } }, [listing])).size, 0);
});

test('dealer promotional formats differ and use grounded stage, vehicle and bid information', () => {
  const dealer = publicDealerSummary(listing, profile, now)!;
  const lot = { title: '1988 Porsche 928 S4', status: 'active' as const, startTime: now - 1, endTime: now + 3600000, currentBid: 22000, mileage: '134652', engine: '5.0L V8', drivetrain: 'Automatic' };
  const live = dealerPromoTemplates(dealer, lot, 'live', 'https://example.test/lot', now);
  assert.equal(new Set(Object.values(live)).size, 3);
  for (const copy of Object.values(live)) { assert.ok(copy.includes('LIVE NOW')); assert.ok(copy.includes('1988 Porsche')); assert.ok(copy.includes('22,000')); assert.ok(!copy.includes('full service history')); }
  assert.ok(live.x_thread.includes('1/3')); assert.ok(live.x_thread.includes('2/3')); assert.ok(live.x_thread.includes('3/3'));
  const ending = dealerPromoTemplates(dealer, lot, 'ending_soon', 'https://example.test/lot', now);
  assert.ok(ending.marketplace_pitch.includes('ENDING SOON')); assert.ok(ending.marketplace_pitch.includes('Closes:'));
  const future = dealerPromoTemplates(dealer, { ...lot, status: 'upcoming', startTime: now + 10000 }, 'upcoming', 'https://example.test/lot', now);
  assert.ok(future.enthusiast_forum.includes('COMING TO AUCTION')); assert.ok(!future.enthusiast_forum.includes('Current bid'));
  const premature = dealerPromoTemplates(dealer, { ...lot, endTime: now + 172800000 }, 'ending_soon', 'https://example.test/lot', now);
  assert.ok(!premature.enthusiast_forum.includes('ENDING SOON'));
  const closed = dealerPromoTemplates(dealer, { ...lot, endTime: now - 1 }, 'live', 'https://example.test/lot', now);
  assert.ok(closed.marketplace_pitch.includes('AUCTION CLOSED')); assert.ok(!closed.marketplace_pitch.includes('join the bidding'));
  const sparse = dealerPromoTemplates(undefined, { title: 'Sparse fixture', status: 'draft' }, 'ending_soon', 'https://example.test/lot', now);
  assert.ok(!JSON.stringify(sparse).includes('Verified Boutique Dealer')); assert.ok(!JSON.stringify(sparse).includes('undefined')); assert.ok(!JSON.stringify(sparse).includes('ENDING SOON'));
});

test('dealer canvas and copy share truthful campaign headlines', () => {
  const now = 100000;
  const live = { status: 'active' as const, startTime: now - 1, endTime: now + 3600000 };
  assert.equal(dealerCampaignState(live, 'upcoming', now).hook, 'LIVE NOW');
  assert.equal(dealerCampaignState(live, 'ending_soon', now).hook, 'ENDING SOON');
  assert.equal(dealerCampaignState({ ...live, endTime: now - 1 }, 'live', now).hook, 'AUCTION CLOSED');
  assert.equal(dealerCampaignState({}, 'ending_soon', now).hook, 'VEHICLE PREVIEW');
  assert.equal(dealerCampaignState({ status: 'upcoming', startTime: now + 1000 }, 'live', now).hook, 'COMING TO AUCTION');
});
