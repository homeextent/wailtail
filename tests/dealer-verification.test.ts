import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { handleDealerVerification, parseDealerVerification } from '../server/api/admin-dealer-verification';
import { dealerListingEligible } from '../server/api/_lib/dealerEligibility';

export const dealerProfile = { legalBusinessName: 'Synthetic dealer', dbaName: '', dealerLicenseNumber: 'TEST-123',
  licensingJurisdiction: 'ON', primaryRepresentativeUid: 'synthetic-representative', streetAddress: '1 Test Street',
  postalCode: 'L2R 1A1', city: 'St. Catharines', province: 'ON', phone: '905-555-0100', website: '',
  displayPhonePublicly: false, displayWebsitePublicly: false, verificationExpiresAt: Date.now() + 86400000 };
export const verificationCommand = { applicationId: 'application', source: 'consignment_applications', action: 'verified',
  expectedRevision: 0, commandId: randomUUID(), reason: 'Synthetic manual findings', verificationMethod: 'Manual registry check',
  sourceReferenceDescription: 'Synthetic registry record, not a live check', checkedAt: Date.now() - 60000, profile: dealerProfile };
const admin = { uid: 'admin', email: 'jeremygoodmurphy@gmail.com', email_verified: true };
export async function invokeDealer(body: any, services: any, headers: any = { authorization: 'Bearer synthetic' }, method = 'POST') {
  const res = { code: 200, data: undefined as any, setHeader() {}, status(n: number) { this.code = n; return this; }, json(data: any) { this.data = data; return this; } };
  await handleDealerVerification({ method, headers, body }, res, services); return res;
}
test('M2.3 strict command parser rejects spoofed authority, extra fields, invalid identities and incomplete evidence', () => {
  assert.ok(parseDealerVerification(verificationCommand));
  assert.ok(parseDealerVerification({ applicationId: 'a', source: 'consignments', action: 'read' }));
  for (const body of [null, [], { ...verificationCommand, administratorUid: 'forged' }, { ...verificationCommand, applicationId: '../bad' },
    { ...verificationCommand, expectedRevision: -1 }, { ...verificationCommand, commandId: 'not-uuid' }, { ...verificationCommand, reason: '' },
    { ...verificationCommand, source: 'users' }, { ...verificationCommand, checkedAt: null }, { ...verificationCommand, verificationMethod: '' },
    ...[{ primaryRepresentativeUid: '../uid' }, { verificationStatus: 'verified' }, { province: 'NY' }, { displayPhonePublicly: 'true' },
      { displayWebsitePublicly: true }, { website: 'javascript:alert(1)' }, { legalBusinessName: '' }].map(p => ({ ...verificationCommand, profile: { ...dealerProfile, ...p } })),
    { ...verificationCommand, action: 'suspended' }, { ...verificationCommand, action: 'read' }]) assert.equal(parseDealerVerification(body), null);
});
test('M2.3 authorizes exact verified designated administrators before reading/writing, not mutable roles', async () => {
  for (const [token, expected] of [[{ ...admin, email_verified: false }, 401], [{ ...admin, email: 'other@example.test', role: 'admin' }, 403]] as const) {
    const services = { auth: { verifyIdToken: async (_: any, revoked: boolean) => { assert.equal(revoked, true); return token; } }, firestore: { runTransaction: () => assert.fail('unauthorized database access') } };
    assert.equal((await invokeDealer(verificationCommand, services)).code, expected);
  }
  assert.equal((await invokeDealer(verificationCommand, {}, {}, 'DELETE')).code, 405);
  assert.equal((await invokeDealer(verificationCommand, {}, {})).code, 401);
  assert.equal((await invokeDealer(verificationCommand, { auth: { verifyIdToken: async () => { throw Error('revoked'); } } })).code, 401);
});
test('M2.3 rejects missing, disabled or unverified representative Auth records before transaction', async () => {
  for (const record of [null, { emailVerified: false, email: 'rep@example.test' }, { emailVerified: true, disabled: true, email: 'rep@example.test' }, { emailVerified: true, email: admin.email }]) {
    const services = { auth: { verifyIdToken: async () => admin, getUser: async () => { if (!record) throw Object.assign(Error('not found'), { code: 'auth/user-not-found' }); return record; } },
      firestore: { collection: () => ({ doc: () => ({}) }), runTransaction: () => assert.fail('ineligible database mutation') } };
    assert.equal((await invokeDealer(verificationCommand, services)).code, 422);
  }
});
test('M2.3 shared dealer eligibility denies expired, suspended, missing and mismatched trusted associations', async () => {
  const now = Date.now();
  const listing = { sellerType: 'dealer', dealerId: 'dealer', sellerId: 'rep' };
  const good = { verificationStatus: 'verified', verificationExpiresAt: now + 1000, primaryRepresentativeUid: 'rep' };
  const firestore = { collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }) } as any;
  for (const [profile, link, expected] of [[good, 'dealer', true], [{ ...good, verificationStatus: 'suspended' }, 'dealer', false],
    [{ ...good, verificationExpiresAt: now }, 'dealer', false], [undefined, 'dealer', false],
    [{ ...good, primaryRepresentativeUid: 'other' }, 'dealer', false], [good, 'other', false]] as const) {
    const transaction = { get: async (ref: any) => ({ data: () => ref.path.startsWith('dealer_profiles') ? profile : { dealerId: link } }) } as any;
    assert.equal(await dealerListingEligible(transaction, firestore, listing, 'rep', now), expected);
  }
  assert.equal(await dealerListingEligible({ get: () => assert.fail('private seller must not query dealer data') } as any, firestore, { sellerId: 'private' }, 'private', now), true);
});
