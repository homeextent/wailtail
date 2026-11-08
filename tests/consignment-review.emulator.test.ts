import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { handleConsignmentReview } from '../server/api/admin-consignment-review';
import { NAMED_FIRESTORE_DATABASE_ID } from '../server/api/_lib/firebaseAdmin';

// This test injects only synthetic authentication; transactions use real Firestore emulation.
test('M2.1 transactions preserve application, concurrent notes, source isolation, retry and paginated history', async () => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-wailtail-stage3');
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:\d+$/);
  for (const name of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL']) assert.ok(!process.env[name]);
  const app = initializeApp({ projectId: 'demo-wailtail-stage3' }, `m21-${randomUUID()}`);
  const firestore = getFirestore(app, NAMED_FIRESTORE_DATABASE_ID);
  const applicationId = randomUUID();
  const base = { applicationId, source: 'consignment_applications', action: 'read' };
  const canonical = firestore.collection('consignment_applications').doc(applicationId);
  const legacy = firestore.collection('consignments').doc(applicationId);
  const original = { sellerEmail: 'seller@example.test', status: 'pending', notes: 'Applicant declaration', submittedAt: 123 };
  const services = { firestore, auth: { verifyIdToken: async (_token: string, checkRevoked: boolean) => {
    assert.equal(checkRevoked, true); return { uid: 'admin', email: 'jeremygoodmurphy@gmail.com', email_verified: true };
  } } } as any;
  const invoke = async (body: any) => {
    const res = { code: 200, data: undefined as any, setHeader() {}, status(n: number) { this.code = n; return this; }, json(data: any) { this.data = data; return this; } };
    await handleConsignmentReview({ method: 'POST', headers: { authorization: 'Bearer synthetic' }, body }, res, services);
    return res;
  };
  try {
    await canonical.set(original); await legacy.set({ ...original, notes: 'Legacy source' });
    let read = await invoke(base); assert.equal(read.code, 200); assert.equal(read.data.review.revision, 0);
    assert.equal((await firestore.collection('consignmentReviews').doc(`${base.source}:${applicationId}`).get()).exists, false, 'inspection must not create metadata');
    const command = { ...base, action: 'add_note', expectedRevision: 0, commandId: randomUUID(), note: 'First private note' };
    const competitor = { ...command, commandId: randomUUID(), note: 'Second private note' };
    const concurrent = await Promise.all([invoke(command), invoke(competitor)]);
    assert.deepEqual(concurrent.map(r => r.code).sort(), [200, 409]);
    const won = concurrent[0].code === 200 ? command : competitor;
    const lost = concurrent[0].code === 200 ? competitor : command;
    assert.equal((await invoke(won)).code, 200, 'lost-response retry must not duplicate');
    read = await invoke(base); assert.equal(read.data.events.length, 1); assert.equal(read.data.review.revision, 1);
    assert.equal((await invoke({ ...lost, expectedRevision: 1 })).code, 200);
    assert.equal((await invoke({ ...base, action: 'assign', expectedRevision: 2, commandId: randomUUID(), assigneeEmail: 'jeremy@theinnovativegroup.ca' })).code, 200);
    assert.equal((await invoke({ ...base, action: 'assign', expectedRevision: 3, commandId: randomUUID(), assigneeEmail: 'seller@example.test' })).code, 422);
    read = await invoke(base); assert.equal(read.data.review.assigneeEmail, 'jeremy@theinnovativegroup.ca');
    assert.equal(read.data.events.length, 3);
    assert.deepEqual((await canonical.get()).data(), original);
    const legacyRead = await invoke({ ...base, source: 'consignments' });
    assert.equal(legacyRead.data.application.notes, 'Legacy source'); assert.equal(legacyRead.data.events.length, 0);
    const root = firestore.collection('consignmentReviews').doc(`${base.source}:${applicationId}`);
    const batch = firestore.batch();
    for (let revision = 4; revision <= 54; revision++) batch.create(root.collection('events').doc(randomUUID()), {
      revision, action: 'add_note', value: `Older-page test ${revision}`, createdAt: revision, administratorUid: 'admin', administratorEmail: 'jeremygoodmurphy@gmail.com'
    });
    batch.update(root, { revision: 54 }); await batch.commit();
    read = await invoke(base); assert.equal(read.data.events.length, 50); assert.equal(read.data.hasMore, true);
    const older = await invoke({ ...base, beforeRevision: read.data.events.at(-1).revision });
    assert.equal(older.code, 200); assert.equal(older.data.events.length, 4); assert.equal(older.data.hasMore, false);
    assert.equal(new Set([...read.data.events, ...older.data.events].map(e => e.revision)).size, 54);
    assert.deepEqual((await canonical.get()).data(), original);
    const missing = await invoke({ ...base, applicationId: 'does-not-exist' }); assert.equal(missing.code, 404);
  } finally { await deleteApp(app); }
});
