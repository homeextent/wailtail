import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parseConsignmentIntake, handleSubmitConsignment } from '../server/api/submit-consignment';
import { CANADIAN_LICENSING_JURISDICTIONS, DEALER_DECLARATIONS, INTAKE_DECLARATION_VERSION } from '../src/config/consignmentIntake';

const privateInput = { submissionId: randomUUID(), applicantType: 'private', year: 1988, make: ' Porsche ', model: '928', sellerName: ' Contact ', sellerEmail: ' CONTACT@Example.Test ', termsAccepted: true, declarationVersion: INTAKE_DECLARATION_VERSION };
const dealerInput = { ...privateInput, applicantType: 'dealer', sellerPhone: '(905) 555-0123', submittedDealershipName: ' Synthetic Collector Cars Inc. ', submittedDbaName: 'Collector Cars', submittedDealerLicenseNumber: 'TEST-123', submittedLicensingJurisdiction: 'ON', ...Object.fromEntries(DEALER_DECLARATIONS.map(([key]) => [key, true])) };
function parsed(input: unknown) { const result = parseConsignmentIntake(input); assert.ok(!('error' in result), JSON.stringify(result)); return result; }

test('private and dealer contracts normalize contacts, retain declarations and accept all 13 jurisdictions', () => {
  const result = parsed(privateInput);
  assert.equal(result.application.sellerEmail, 'contact@example.test');
  assert.equal(result.application.make, 'Porsche'); assert.equal(result.application.sellerName, 'Contact');
  assert.equal(result.application.year, '1988'); assert.equal(result.application.applicantType, 'private');
  assert.equal(result.application.status, undefined); assert.equal(result.application.submittedAt, undefined);
  for (const [code] of CANADIAN_LICENSING_JURISDICTIONS) {
    const dealer = parsed({ ...dealerInput, submittedLicensingJurisdiction: code });
    assert.equal(dealer.application.submittedDealershipName, 'Synthetic Collector Cars Inc.');
    for (const [key] of DEALER_DECLARATIONS) assert.equal(dealer.application[key], true);
  }
});
test('every required dealer field and declaration is enforced; malformed booleans never count as assent', () => {
  for (const key of ['submittedDealershipName', 'submittedDealerLicenseNumber', 'submittedLicensingJurisdiction', 'sellerPhone', 'sellerName', 'sellerEmail', ...DEALER_DECLARATIONS.map(([key]) => key)]) {
    const incomplete = { ...dealerInput }; delete incomplete[key];
    assert.ok('error' in parseConsignmentIntake(incomplete), key);
  }
  for (const [key] of DEALER_DECLARATIONS) for (const value of [false, 'true', 1, null, '']) assert.ok('error' in parseConsignmentIntake({ ...dealerInput, [key]: value }));
  for (const input of [{ submittedLicensingJurisdiction: 'XX' }, { sellerPhone: '123' }, { submittedDealershipName: ' ' }, { submittedDbaName: 'x'.repeat(201) }]) assert.ok('error' in parseConsignmentIntake({ ...dealerInput, ...input }));
});
test('untrusted status, identities, private notes and declaration timestamps are rejected before writes', () => {
  for (const key of ['status', 'submittedAt', 'declarationAcceptedAt', 'reviewSource', 'registeredUserId', 'role', 'sellerId', 'dealerId', 'sellerType', 'dealerSnapshot', 'verificationStatus', 'verifiedAt', 'reviewedBy', 'adminNotes']) assert.ok('error' in parseConsignmentIntake({ ...dealerInput, [key]: 'forged' }), key);
  for (const key of ['submittedDealershipName', 'submittedDbaName', 'submittedDealerLicenseNumber', ...DEALER_DECLARATIONS.map(([key]) => key)]) assert.ok('error' in parseConsignmentIntake({ ...privateInput, [key]: dealerInput[key] }));
  for (const input of [{ applicantType: ['dealer'] }, { applicantType: 'other' }, { termsAccepted: false }, { declarationVersion: 'outdated' }, { sellerEmail: 'bad' }, { year: 'tomorrow' }, { notes: 'x'.repeat(8001) }, { submissionId: '../path' }]) assert.ok('error' in parseConsignmentIntake({ ...privateInput, ...input }));
});
function harness(fail = false, occupied = false) {
  const records = new Map<string, any>(); const committed: any[] = [];
  if (occupied) records.set(`consignment_applications/${dealerInput.submissionId}`, { unrelated: true });
  const services = { firestore: { collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
    runTransaction: async (run: any) => {
      const staged: any[] = [];
      const result = await run({ get: async (ref: any) => ({ exists: records.has(ref.path), data: () => records.get(ref.path) }), create: (ref: any, value: any) => staged.push([ref.path, value]) });
      if (fail) throw new Error('commit rejected');
      for (const [path, value] of staged) records.set(path, value);
      committed.push(...staged); return result;
    }
  } } as any;
  return { records, committed, async call(body: unknown = dealerInput, method = 'POST') {
    const res = { code: 200, payload: undefined as any, headers: {} as any, status(n: number) { this.code = n; return this; }, json(value: any) { this.payload = value; return this; }, setHeader(k: string, v: string) { this.headers[k] = v; } };
    await handleSubmitConsignment({ method, body }, res, services); return res;
  } };
}
test('guest intake atomically creates pending canonical and legacy records with server timestamps', async () => {
  const h = harness(); const start = Date.now(); const result = await h.call();
  assert.equal(result.code, 201); assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(h.committed.length, 3);
  const app = h.records.get(`consignment_applications/${dealerInput.submissionId}`);
  assert.equal(app.status, 'pending'); assert.ok(app.submittedAt >= start); assert.equal(app.declarationAcceptedAt, app.submittedAt);
  assert.equal(app.sellerEmail, 'contact@example.test'); assert.equal(app.dealerId, undefined);
  assert.deepEqual(h.records.get(`consignments/${dealerInput.submissionId}`), app);
});
test('unchanged retry deduplicates, edited retry conflicts, deleted records never resurrect, and collisions are preserved', async () => {
  const h = harness(); await h.call(); const second = await h.call();
  assert.equal(second.code, 200); assert.equal(second.payload.created, false); assert.equal(h.committed.length, 3);
  assert.equal((await h.call({ ...dealerInput, notes: 'different' })).code, 409);
  h.records.delete(`consignment_applications/${dealerInput.submissionId}`); assert.equal((await h.call()).code, 409); assert.equal(h.committed.length, 3);
  const collision = harness(false, true); assert.equal((await collision.call()).code, 409); assert.equal(collision.committed.length, 0);
});
test('invalid data, failed atomic persistence and unsupported method never claim success', async () => {
  const h = harness(true); assert.equal((await h.call()).code, 503); assert.equal(h.committed.length, 0);
  assert.equal((await harness().call({ ...dealerInput, verifiedAt: 1 })).code, 422);
  assert.equal((await harness().call(privateInput, 'DELETE')).code, 405);
});
