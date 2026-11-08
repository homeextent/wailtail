import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
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

test('M2.3 exact account lookup is admin-only, read-only, minimally projected and never auto-links', async () => {
  const base = { applicationId: 'application', source: 'consignment_applications', action: 'lookup_account', accountLookupType: 'email', accountQuery: 'rep@example.test' };
  for (const bad of [{ ...base, profile: dealerProfile }, { ...base, accountQuery: 'rep*' }, { ...base, accountLookupType: 'name' }, { ...base, accountQuery: ' rep@example.test' }, { ...verificationCommand, accountQuery: 'rep@example.test' }]) assert.equal(parseDealerVerification(bad), null);
  let lookups = 0;
  const record = { uid: 'rep', email: 'rep@example.test', displayName: 'Synthetic representative', emailVerified: true, disabled: false, customClaims: { secret: true }, tokensValidAfterTime: 'private' };
  const services = { auth: { verifyIdToken: async () => admin, getUserByEmail: async (value: string) => { assert.equal(value, record.email); lookups++; return record; }, getUser: async (value: string) => { assert.equal(value, 'rep'); lookups++; return record; } },
    firestore: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ applicantType: 'dealer' }) }) }) }), runTransaction: () => assert.fail('lookup must not mutate') } };
  const found = await invokeDealer(base, services); assert.equal(found.code, 200); assert.equal(found.data.account.uid, 'rep'); assert.equal(found.data.account.eligible, true);
  assert.equal(found.data.account.customClaims, undefined); assert.equal(found.data.account.tokensValidAfterTime, undefined);
  assert.equal((await invokeDealer({ ...base, accountLookupType: 'uid', accountQuery: 'rep' }, services)).code, 200);
  assert.equal(lookups, 2);
  for (const changed of [{ emailVerified: false }, { disabled: true }, { email: admin.email }]) {
    const result = await invokeDealer(base, { ...services, auth: { ...services.auth, getUserByEmail: async () => ({ ...record, ...changed }) } });
    assert.equal(result.data.account.eligible, false);
  }
  assert.equal((await invokeDealer(base, { ...services, auth: { ...services.auth, getUserByEmail: async () => { throw Object.assign(Error(), { code: 'auth/user-not-found' }); } } })).code, 404);
  const forbidden = await invokeDealer(base, { ...services, auth: { ...services.auth, verifyIdToken: async () => ({ ...admin, email: 'other@example.test', role: 'admin' }), getUserByEmail: () => assert.fail('unauthorized account lookup') } });
  assert.equal(forbidden.code, 403);
});

test('M2.3 local date controls preserve absolute timestamps across winter/summer and reject invalid local times', () => {
  const script = `import assert from 'node:assert/strict';
    import {dealerLocalDateInput, parseDealerLocalDate} from './src/config/dealerVerification.ts';
    assert.equal(dealerLocalDateInput(Date.parse('2026-11-08T17:00:00Z')), '2026-11-08T12:00');
    assert.equal(parseDealerLocalDate('2026-11-08T12:00'), Date.parse('2026-11-08T17:00:00Z'));
    assert.equal(parseDealerLocalDate('2026-07-08T12:00'), Date.parse('2026-07-08T16:00:00Z'));
    assert.ok(Number.isNaN(parseDealerLocalDate('2026-03-08T02:30')));
    assert.ok(Number.isNaN(parseDealerLocalDate('2026-02-30T12:00')));
    assert.ok(Number.isNaN(parseDealerLocalDate('invalid')));
    assert.equal(parseDealerLocalDate('2026-11-01T01:30'), Date.parse('2026-11-01T05:30:00Z'));
    assert.equal(parseDealerLocalDate('2026-11-01T01:30', Date.parse('2026-11-01T06:30:25Z')), Date.parse('2026-11-01T06:30:25Z'));
    console.log('local date boundaries passed');`;
  assert.match(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { env: { ...process.env, TZ: 'America/Toronto' }, encoding: 'utf8' }), /local date boundaries passed/);
});
