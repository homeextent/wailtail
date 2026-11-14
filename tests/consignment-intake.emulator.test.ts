import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { handleSubmitConsignment } from '../server/api/submit-consignment';
import { NAMED_FIRESTORE_DATABASE_ID } from '../server/api/_lib/firebaseAdmin';
import { DEALER_DECLARATIONS, INTAKE_DECLARATION_VERSION } from '../src/config/consignmentIntake';

test('M2.2 guest intake deduplicates concurrent retries and persists a pending server-stamped declaration record', async () => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-wailtail-stage3');
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:\d+$/);
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL']) assert.ok(!process.env[key]);
  const app = initializeApp({ projectId: 'demo-wailtail-stage3' }, `intake-${randomUUID()}`);
  const firestore = getFirestore(app, NAMED_FIRESTORE_DATABASE_ID);
  const input = { submissionId: randomUUID(), applicantType: 'dealer', year: 1988, make: 'Porsche', model: '928', sellerName: 'Representative', sellerPhone: '905-555-0123', sellerEmail: ' Dealer@Example.Test ', submittedDealershipName: 'Synthetic Dealer Inc.', submittedDealerLicenseNumber: 'TEST-123', submittedLicensingJurisdiction: 'ON', termsAccepted: true, declarationVersion: INTAKE_DECLARATION_VERSION, ...Object.fromEntries(DEALER_DECLARATIONS.map(([key]) => [key, true])) };
  async function invoke(body: any) {
    const res = { code: 200, data: undefined as any, setHeader() {}, status(n: number) { this.code = n; return this; }, json(value: any) { this.data = value; return this; } };
    await handleSubmitConsignment({ method: 'POST', body }, res, { firestore }); return res;
  }
  try {
    const concurrent = await Promise.all([invoke(input), invoke(input)]);
    assert.deepEqual(concurrent.map(r => r.code).sort(), [200, 201]);
    const ref = firestore.collection('consignment_applications').doc(input.submissionId);
    const record = (await ref.get()).data()!;
    assert.equal(record.status, 'pending'); assert.equal(record.sellerEmail, 'dealer@example.test');
    assert.equal(record.declarationVersion, INTAKE_DECLARATION_VERSION); assert.equal(record.declarationAcceptedAt, record.submittedAt);
    assert.deepEqual((await firestore.collection('consignments').doc(input.submissionId).get()).data(), record);
    assert.equal(record.dealerId, undefined); assert.equal(record.verificationStatus, undefined); assert.equal(record.registeredUserId, undefined);
    assert.equal((await invoke({ ...input, sellerName: 'Changed' })).code, 409); assert.deepEqual((await ref.get()).data(), record);
    const invalidId = randomUUID();
    assert.equal((await invoke({ ...input, submissionId: invalidId, noBrokeredInventoryDeclaration: false })).code, 422);
    assert.equal((await firestore.collection('consignment_applications').doc(invalidId).get()).exists, false);
    assert.equal((await firestore.collection('consignments').doc(invalidId).get()).exists, false);
    const privateId = randomUUID();
    const privateInput = { submissionId: privateId, applicantType: 'private', year: 1988, make: 'Porsche', model: '928', sellerName: 'Private owner', sellerEmail: 'private@example.test', termsAccepted: true, declarationVersion: INTAKE_DECLARATION_VERSION };
    assert.equal((await invoke(privateInput)).code, 201);
    assert.equal((await firestore.collection('consignment_applications').doc(privateId).get()).get('applicantType'), 'private');
  } finally { await deleteApp(app); }
});
