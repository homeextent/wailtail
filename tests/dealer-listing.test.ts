import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { handleDealerListing, parseDealerListing } from '../server/api/admin-dealer-listing';
import { dealerSnapshot } from '../server/api/_lib/dealerListing';
import { handleAdminUpdateAuction } from '../server/api/admin-update-auction';

const command = { action: 'convert', applicationId: 'synthetic', expectedRevision: 1,
  applicationFingerprint: 'a'.repeat(64),
  commandId: randomUUID(), taxHandling: 'requires_confirmation', reason: 'Vehicle curation approved' };
import { callListing } from './dealer-listing-helpers';
test('M2.4 strict commands reject source overrides, authority, ownership, fees and stale/invalid revisions', () => {
  assert.ok(parseDealerListing(command)); assert.ok(parseDealerListing({ action: 'read', applicationId: 'synthetic' }));
  for (const body of [null, [], { ...command, source: 'consignments' }, { ...command, sellerId: 'spoof' },
    { ...command, dealerId: 'spoof' }, { ...command, dealerSnapshot: {} }, { ...command, dealerDocFee: 100 },
    { ...command, taxHandling: 'automatic_tax' }, { ...command, expectedRevision: -1 }, { ...command, reason: ' ' },
    { ...command, applicationId: '../bad' }, { ...command, commandId: 'bad' }, { ...command, action: 'read' }]) assert.equal(parseDealerListing(body), null);
});
test('M2.4 dealer snapshot is an explicit privacy allowlist with consent-gated contacts', () => {
  const profile = { legalBusinessName: 'Synthetic dealer', dbaName: 'Synthetic showroom', city: 'Toronto', province: 'ON',
    verifiedAt: 123, primaryRepresentativeUid: 'rep', phone: '555', website: 'https://example.test',
    streetAddress: 'Private address', postalCode: 'Private postal', dealerLicenseNumber: 'Private licence',
    licensingJurisdiction: 'ON', verificationMethod: 'Private checks', sourceReferenceDescription: 'Private evidence',
    primaryRepresentativeEmail: 'private@example.test', displayPhonePublicly: false, displayWebsitePublicly: false };
  const result = dealerSnapshot(profile, 'dealer', 7)!;
  assert.deepEqual(Object.keys(result).sort(), ['dealerId', 'dealershipName', 'displayName', 'dbaName', 'city', 'province', 'verifiedAt', 'verificationRecordVersion'].sort());
  assert.equal(dealerSnapshot({ ...profile, displayPhonePublicly: true }, 'dealer', 7)!.phone, '555');
  assert.equal(dealerSnapshot({ ...profile, displayWebsitePublicly: true }, 'dealer', 7)!.website, 'https://example.test');
});
test('M2.4 endpoints reject mutable-role administrators and protected generic edits before database operations', async () => {
  const noDb = { collection: () => assert.fail('unauthorized database access'), runTransaction: () => assert.fail('invalid database mutation') };
  const services = { firestore: noDb, auth: { verifyIdToken: async () => ({ uid: 'other', email: 'other@example.test', email_verified: true, role: 'admin' }) } };
  assert.equal((await callListing(handleDealerListing, command, services)).code, 403);
  assert.equal((await callListing(handleDealerListing, command, {}, 'DELETE')).code, 405);
  assert.equal((await callListing(handleDealerListing, command, {}, 'POST', {})).code, 401);
  const admin = { ...services, auth: { verifyIdToken: async () => ({ uid: 'admin', email: 'jeremygoodmurphy@gmail.com', email_verified: true }) } };
  for (const updates of [{ dealerId: 'spoof' }, { dealerSnapshot: {} }, { sellerId: 'spoof' }, { dealerDocFee: 1 }, { taxHandling: 'dealer_collects' }]) {
    assert.equal((await callListing(handleAdminUpdateAuction, { auctionId: 'draft', updates }, admin)).code, 422);
  }
});
