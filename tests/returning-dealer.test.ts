import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { handleDealerVehicleIntake } from '../server/api/dealer-vehicle-intake';
import { callListing } from './dealer-listing-helpers';
import { DEALER_DECLARATIONS, INTAKE_DECLARATION_VERSION } from '../src/config/consignmentIntake';

const caseId = 'c'.repeat(64);
const payload = () => ({ action: 'submit', submissionId: randomUUID(), year: '1988', make: 'Porsche', model: '928',
  sellerName: 'Representative', sellerEmail: 'forged-contact@example.test', sellerPhone: '9055550123',
  termsAccepted: true, declarationVersion: INTAKE_DECLARATION_VERSION,
  ...Object.fromEntries(DEALER_DECLARATIONS.map(([k]) => [k, true])) });
function harness() {
  const data = new Map<string, any>([
    ['users/rep', { dealerId: 'dealer', displayName: 'Representative', role: 'bidder' }], ['bidders/rep', { dealerId: 'dealer', role: 'bidder' }],
    ['dealer_profiles/dealer', { verificationStatus: 'verified', verificationExpiresAt: Date.now() + 86400000,
      primaryRepresentativeUid: 'rep', verificationCaseId: caseId, legalBusinessName: 'Dealer Inc', dealerLicenseNumber: 'SECRET-LICENCE', licensingJurisdiction: 'ON', city: 'Toronto', province: 'ON' }],
    [`dealerVerificationCases/${caseId}`, { dealerId: 'dealer', revision: 3 }]
  ]);
  const written: any[] = [];
  const services: any = { auth: { verifyIdToken: async () => ({ uid: 'rep', email: 'rep@example.test', email_verified: true }) }, firestore: {
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
    runTransaction: async (fn: any) => { const writes: any[] = []; const result = await fn({
      get: async (ref: any) => ({ exists: data.has(ref.path), data: () => data.get(ref.path) }),
      create: (ref: any, value: any) => writes.push([ref.path, value]) });
      for (const [path, value] of writes) { assert.ok(!data.has(path)); data.set(path, value); written.push(path); } return result; }
  } };
  return { data, services, written, call: (body: any) => callListing(handleDealerVehicleIntake, body, services) };
}
test('returning intake uses token UID and protected links; context is a minimal own-business allowlist', async () => {
  const h = harness(); const context = await h.call({ action: 'context' });
  assert.equal(context.code, 200); assert.equal(context.data.dealer.status, 'current');
  assert.equal(context.data.dealer.name, 'Dealer Inc');
  assert.ok(!JSON.stringify(context.data).includes('SECRET-LICENCE'));
  assert.equal(context.data.dealer.dealerId, undefined); assert.equal(context.data.dealer.primaryRepresentativeUid, undefined);
  const input = payload(); assert.equal((await h.call(input)).code, 201);
  const record = h.data.get(`consignment_applications/${input.submissionId}`);
  assert.equal(record.dealerId, 'dealer'); assert.equal(record.registeredUserId, 'rep'); assert.equal(record.sellerEmail, 'rep@example.test');
  assert.equal(record.dealerVerificationCaseId, caseId); assert.equal(record.intakePath, 'returning_dealer');
  assert.equal(record.submittedDealerLicenseNumber, undefined); assert.equal(record.status, 'pending');
  assert.equal(h.written.length, 4); assert.equal((await h.call(input)).data.created, false);
  assert.equal(h.written.length, 4); assert.equal((await h.call({ ...input, model: '944' })).code, 409);
  assert.equal(h.data.get('users/rep').role, 'bidder');
  h.data.get('dealer_profiles/dealer').verificationExpiresAt = Date.now() - 1;
  assert.equal((await h.call(input)).code, 409);
  h.data.get('dealer_profiles/dealer').verificationExpiresAt = Date.now() + 86400000;
  assert.equal((await h.call(input)).data.created, false, 'restored retry retains original application');
  assert.equal(h.written.length, 4);
});
test('expiry, suspension, broken links and missing case block writes and report their distinct state', async () => {
  for (const mode of ['expired', 'suspended', 'mismatch', 'missing-case', 'wrong-representative']) {
    const h = harness(); const p = h.data.get('dealer_profiles/dealer');
    if (mode === 'expired') p.verificationExpiresAt = Date.now() - 1;
    if (mode === 'suspended') p.verificationStatus = 'suspended';
    if (mode === 'mismatch') h.data.get('bidders/rep').dealerId = 'other';
    if (mode === 'missing-case') h.data.delete(`dealerVerificationCases/${caseId}`);
    if (mode === 'wrong-representative') p.primaryRepresentativeUid = 'other';
    const context = await h.call({ action: 'context' });
    assert.equal(context.data.dealer.status, ['expired', 'suspended'].includes(mode) ? mode : 'unavailable');
    assert.equal((await h.call(payload())).code, 409); assert.equal(h.written.length, 0);
  }
});
test('returning intake rejects authority injection, omitted declarations, stale terms and unauthorized callers', async () => {
  for (const field of ['dealerId','representativeUid','dealerVerificationCaseId','registeredUserId','status','intakePath','submittedDealerLicenseNumber','applicantType']) {
    const h = harness(); assert.equal((await h.call({ ...payload(), [field]: 'forged' })).code, 422); assert.equal(h.written.length, 0);
  }
  for (const patch of [{ dealershipOwnershipDeclaration: false }, { declarationVersion: 'old' }, { termsAccepted: false }, { notes: 'x'.repeat(8001) }]) {
    const h = harness(); assert.equal((await h.call({ ...payload(), ...patch })).code, 422); assert.equal(h.written.length, 0);
  }
  const h = harness();
  assert.equal((await callListing(handleDealerVehicleIntake, payload(), h.services, 'POST', {})).code, 401);
  h.services.auth.verifyIdToken = async () => ({ uid: 'rep', email_verified: false });
  assert.equal((await h.call(payload())).code, 401); assert.equal(h.written.length, 0);
  assert.equal((await callListing(handleDealerVehicleIntake, {}, h.services, 'DELETE')).code, 405);
});
