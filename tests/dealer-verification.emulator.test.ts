import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { handleSellerDraftMedia } from '../server/api/seller-draft-media';
import { handleSellerDraftUpload } from '../server/api/seller-draft-upload';
import { handleDealerVerification } from '../server/api/admin-dealer-verification';
import { handleSellerDraftNarrative, handleSellerDraftSubmission } from '../server/api/seller-draft-narrative';
import { NAMED_FIRESTORE_DATABASE_ID } from '../server/api/_lib/firebaseAdmin';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
test('M2.3 real transactions: identity conflicts, immutable decisions, atomic links, retry, lifecycle enforcement and curation separation', async () => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-wailtail-stage3');
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key] || '', /^127\.0\.0\.1:\d+$/);
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL']) assert.ok(!process.env[key]);
  const app = initializeApp({ projectId: 'demo-wailtail-stage3' }, `m23-${randomUUID()}`);
  const firestore = getFirestore(app, NAMED_FIRESTORE_DATABASE_ID), auth = getAuth(app);
  const uid = `rep-${randomUUID()}`, unverifiedUid = `unverified-${randomUUID()}`;
  const applicationId = randomUUID(), source = 'consignment_applications';
  const caseId = hash(`${source}:${applicationId}`), dealerId = `dealer_${caseId}`;
  const original = { applicantType: 'dealer', status: 'pending', sellerEmail: 'untrusted-applicant@example.test', submittedDealershipName: 'Applicant claim', dealershipOwnershipDeclaration: true };
  const application = firestore.collection(source).doc(applicationId);
  const base = { applicationId, source };
  const profile = { legalBusinessName: 'Synthetic canonical business', dbaName: '', dealerLicenseNumber: `TEST-${randomUUID()}`,
    licensingJurisdiction: 'ON', primaryRepresentativeUid: uid, streetAddress: '1 Test Street', postalCode: 'L2R1A1', city: 'St. Catharines',
    province: 'ON', phone: '9055550100', website: '', displayPhonePublicly: false, displayWebsitePublicly: false, verificationExpiresAt: Date.now() + 86400000 };
  const command = { ...base, action: 'verified', expectedRevision: 0, commandId: randomUUID(), profile, reason: 'Manual synthetic test evidence',
    verificationMethod: 'Manual synthetic registry check', sourceReferenceDescription: 'Synthetic record', checkedAt: Date.now() - 60000 };
  const services = { firestore, auth: { verifyIdToken: async () => ({ uid: 'admin', email: 'jeremygoodmurphy@gmail.com', email_verified: true }), getUser: (id: string) => auth.getUser(id), getUserByEmail: (email: string) => auth.getUserByEmail(email) } } as any;
  const invoke = async (body: any, svc = services) => {
    const res = { code: 200, data: undefined as any, setHeader() {}, status(n: number) { this.code = n; return this; }, json(data: any) { this.data = data; return this; } };
    await handleDealerVerification({ method: 'POST', headers: { authorization: 'Bearer synthetic' }, body }, res, svc); return res;
  };
  const read = () => invoke({ ...base, action: 'read' });
  const decision = async (action: string, extra: any = {}) => {
    const current = await read();
    return invoke({ ...base, action, expectedRevision: current.data.review.revision, commandId: randomUUID(), reason: 'Synthetic decision', ...extra });
  };
  try {
    await auth.createUser({ uid, email: `rep-${randomUUID()}@example.test`, emailVerified: true });
    await auth.createUser({ uid: unverifiedUid, email: `unverified-${randomUUID()}@example.test`, emailVerified: false });
    await application.set(original);
    const lookup = { ...base, action: 'lookup_account', accountLookupType: 'uid', accountQuery: uid };
    const found = await invoke(lookup); assert.equal(found.data.account.uid, uid); assert.equal(found.data.account.eligible, true);
    assert.equal((await invoke({ ...lookup, accountLookupType: 'email', accountQuery: found.data.account.email })).data.account.uid, uid);
    assert.equal((await firestore.collection('users').doc(uid).get()).exists, false, 'lookup creates no links');
    await auth.updateUser(uid, { emailVerified: false });
    assert.equal((await invoke(command)).code, 422, 'save rechecks Auth after an eligible lookup');
    await auth.updateUser(uid, { emailVerified: true });
    assert.equal((await read()).data.profile, null);
    assert.equal((await firestore.collection('dealerVerificationCases').doc(caseId).get()).exists, false);
    assert.equal((await invoke({ ...command, profile: { ...profile, primaryRepresentativeUid: unverifiedUid } })).code, 422);
    assert.equal((await invoke({ ...command, profile: { ...profile, primaryRepresentativeUid: 'no-such-user' } })).code, 422);
    // Throw after staging all real transaction writes: Firestore commits none of them.
    const failure = { ...services, firestore: { collection: firestore.collection.bind(firestore), runTransaction: (callback: any) =>
      firestore.runTransaction(async txn => { await callback(txn); throw Error('synthetic commit failure'); }) } };
    assert.equal((await invoke(command, failure)).code, 503);
    for (const path of [`dealer_profiles/${dealerId}`, `users/${uid}`, `bidders/${uid}`, `dealerVerificationCases/${caseId}`]) assert.equal((await firestore.doc(path).get()).exists, false);
    assert.equal((await firestore.collection('dealer_verification_audits').where('caseId', '==', caseId).get()).size, 0);
    const concurrent = await Promise.all([invoke(command), invoke({ ...command, commandId: randomUUID(), reason: 'Concurrent second admin' })]);
    assert.deepEqual(concurrent.map(r => r.code).sort(), [200, 409]);
    const snapshot = await read(); assert.equal(snapshot.data.events.length, 1); assert.equal(snapshot.data.profile.verificationStatus, 'verified');
    // Determine winning command; the first may have lost the transaction race.
    const firstWon = snapshot.data.events[0].reason === command.reason;
    if (firstWon) { assert.equal((await invoke(command)).code, 200); assert.equal((await invoke({ ...command, reason: 'Changed retry' })).code, 409); }
    for (const collection of ['users', 'bidders']) {
      const linked = (await firestore.collection(collection).doc(uid).get()).data(); assert.equal(linked?.dealerId, dealerId); assert.equal(linked?.role, undefined);
    }
    assert.equal(snapshot.data.profile.displayPhonePublicly, false); assert.equal(snapshot.data.profile.contactVisibilityConsent.recordedBy, 'admin');
    assert.equal(snapshot.data.events[0].before.profile, null);
    assert.equal((await invoke({ ...command, expectedRevision: 1, commandId: randomUUID(), profile: { ...profile, verificationExpiresAt: Date.now() - 1 } })).code, 422);
    const otherId = randomUUID(); await firestore.collection(source).doc(otherId).set(original);
    assert.equal((await invoke({ ...command, applicationId: otherId, commandId: randomUUID() })).code, 409, 'same representative or licence cannot create duplicate dealer');
    await firestore.collection('users').doc(unverifiedUid).set({ dealerId: 'conflicting-dealer' });
    await auth.updateUser(unverifiedUid, { emailVerified: true });
    assert.equal((await invoke({ ...command, applicationId: otherId, commandId: randomUUID(), profile: { ...profile, primaryRepresentativeUid: unverifiedUid, dealerLicenseNumber: `OTHER-${randomUUID()}` } })).code, 409);
    const draftId = `dealer-draft-${randomUUID()}`, draft = firestore.collection('auctions').doc(draftId);
    const listing = { sellerId: uid, sellerType: 'dealer', dealerId, status: 'draft', sellerDraftRevision: 0, title: 'Synthetic test', year: '1988', make: 'Porsche', model: '928' };
    await draft.set(listing);
    const sellerServices = { firestore, auth: { verifyIdToken: async () => ({ uid, email_verified: true, email: 'rep@example.test' }) } } as any;
    const seller = async (submit = false) => {
      const res = { code: 200, data: undefined as any, setHeader() {}, status(n: number) { this.code = n; return this; }, json(data: any) { this.data = data; return this; } };
      const body = submit ? { auctionId: draftId, expectedRevision: 0 } : { auctionId: draftId, expectedRevision: 0, overviewHeading: 'Valid narrative', overviewParagraphs: ['Synthetic paragraph'] };
      await (submit ? handleSellerDraftSubmission : handleSellerDraftNarrative)({ method: 'POST', headers: { authorization: 'Bearer synthetic' }, body }, res, sellerServices); return res;
    };
    assert.equal((await seller()).code, 200); await draft.set(listing);
    assert.equal((await decision('suspended')).code, 200);
    assert.equal((await seller()).code, 403); assert.equal((await seller(true)).code, 403);
    for (const [handler, body] of [
      [handleSellerDraftUpload, { auctionId: draftId, expectedRevision: 0, jpegBase64: Buffer.from([255,216,255,0,255,217]).toString('base64') }],
      [handleSellerDraftMedia, { auctionId: draftId, expectedRevision: 0, action: 'remove', assetId: randomUUID() }]
    ] as const) {
      const res = { code: 200, setHeader() {}, status(n: number) { this.code = n; return this; }, json() { return this; } };
      await handler({ method: 'POST', headers: { authorization: 'Bearer synthetic' }, body }, res, { ...sellerServices, app });
      assert.equal(res.code, 403, 'suspended dealer upload/removal must fail before storage or media mutation');
    }
    assert.deepEqual((await draft.get()).data(), listing);
    const evidence = { profile, verificationMethod: command.verificationMethod, sourceReferenceDescription: command.sourceReferenceDescription, checkedAt: command.checkedAt };
    assert.equal((await decision('renewed', evidence)).code, 409, 'suspension requires explicit reverify');
    assert.equal((await decision('verified', evidence)).code, 200);
    await firestore.collection('dealer_profiles').doc(dealerId).update({ verificationExpiresAt: Date.now() - 1 });
    assert.equal((await seller()).code, 403); assert.equal((await seller(true)).code, 403);
    assert.equal((await decision('renewed', evidence)).code, 200);
    assert.equal((await decision('updated', { ...evidence, profile: { ...profile, city: 'Toronto' } })).code, 200);
    assert.equal((await decision('updated', { ...evidence, profile: { ...profile, primaryRepresentativeUid: unverifiedUid } })).code, 409);
    assert.equal((await decision('rejected')).code, 200); assert.equal((await seller()).code, 403);
    assert.equal((await decision('reviewed')).code, 200);
    const after = await read(); assert.equal(after.data.profile.verificationStatus, 'rejected');
    assert.equal(after.data.events.length, 7); assert.equal(after.data.events[0].administratorUid, 'admin');
    assert.deepEqual((await application.get()).data(), original, 'no vehicle status or applicant mutation');
    assert.equal((await firestore.collection('auctionReviewQueue').where('auctionId', '==', draftId).get()).size, 0);
    assert.equal((await firestore.collection('auctionPublic').doc(draftId).get()).exists, false);
    const guestId = randomUUID(); await firestore.collection(source).doc(guestId).set(original);
    assert.equal((await invoke({ ...base, applicationId: guestId, action: 'reviewed', expectedRevision: 0, commandId: randomUUID(), reason: 'Awaiting an eligible account' })).code, 200);
    assert.equal((await invoke({ ...base, applicationId: guestId, action: 'read' })).data.profile, null);
  } finally { await deleteApp(app); }
});
