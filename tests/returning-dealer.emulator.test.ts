import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { NAMED_FIRESTORE_DATABASE_ID } from '../server/api/_lib/firebaseAdmin';
import { handleDealerVehicleIntake } from '../server/api/dealer-vehicle-intake';
import { handleDealerListing } from '../server/api/admin-dealer-listing';
import { handleSellerDraftRead, handleSellerDraftNarrative, handleSellerDraftSubmission } from '../server/api/seller-draft-narrative';
import { handleSellerDraftUpload } from '../server/api/seller-draft-upload';
import { projectPublicAuction } from '../server/api/public-auctions';
import { callListing } from './dealer-listing-helpers';
import { DEALER_DECLARATIONS, INTAKE_DECLARATION_VERSION } from '../src/config/consignmentIntake';

test('one verified dealership submits and manages two isolated vehicles; lifecycle and transactional conflicts fail safely', async () => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-wailtail-stage3');
  for (const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST']) assert.match(process.env[key] || '', /^127\.0\.0\.1:\d+$/);
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_SERVICE_ACCOUNT_KEY','FIREBASE_PRIVATE_KEY','FIREBASE_CLIENT_EMAIL']) assert.ok(!process.env[key]);
  const bucket = 'demo-wailtail-stage3.appspot.com';
  process.env.FIREBASE_STORAGE_BUCKET = bucket;
  process.env.STORAGE_EMULATOR_HOST = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
  const app = initializeApp({ projectId: 'demo-wailtail-stage3', storageBucket: bucket }, `m27-${randomUUID()}`);
  const firestore = getFirestore(app, NAMED_FIRESTORE_DATABASE_ID), auth = getAuth(app);
  const uid = `returning-${randomUUID()}`, email = `${uid}@example.test`, dealerId = `dealer-${randomUUID()}`;
  const originalId = randomUUID(), caseId = createHash('sha256').update(`consignment_applications:${originalId}`).digest('hex');
  const profileRef = firestore.collection('dealer_profiles').doc(dealerId);
  const caseRef = firestore.collection('dealerVerificationCases').doc(caseId);
  const profile = { legalBusinessName: 'Synthetic Returning Dealer Inc.', dbaName: 'Synthetic Returning Dealer', city: 'Toronto', province: 'ON',
    dealerLicenseNumber: 'PRIVATE-LICENCE', licensingJurisdiction: 'ON', primaryRepresentativeUid: uid, verificationCaseId: caseId,
    verificationStatus: 'verified', verifiedAt: Date.now()-1000, verificationExpiresAt: Date.now()+86400000, phone: '9055550123', displayPhonePublicly: false, displayWebsitePublicly: false };
  const seller: any = { app, firestore, auth: { verifyIdToken: async () => ({ uid, email, email_verified: true }) } };
  const admin: any = { app, firestore, auth: { verifyIdToken: async () => ({ uid: 'admin', email: 'jeremygoodmurphy@gmail.com', email_verified: true }), getUser: (id: string) => auth.getUser(id) } };
  const input = (model: string) => ({ action: 'submit', submissionId: randomUUID(), year: '1988', make: 'Porsche', model,
    sellerName: 'Synthetic Representative', sellerEmail: 'forged@example.test', sellerPhone: '9055550123', termsAccepted: true,
    declarationVersion: INTAKE_DECLARATION_VERSION, ...Object.fromEntries(DEALER_DECLARATIONS.map(([key]) => [key,true])) });
  const intake = (body: any, svc = seller) => callListing(handleDealerVehicleIntake, body, svc);
  const listing = (body: any) => callListing(handleDealerListing, body, admin);
  try {
    await auth.createUser({ uid, email, emailVerified: true });
    for (const collection of ['users','bidders']) await firestore.collection(collection).doc(uid).set({ uid, email, role: 'bidder', dealerId });
    await profileRef.set(profile); await caseRef.set({ dealerId, revision: 1, verificationStatus: 'verified' });
    const a = input('928'), b = input('944');
    const submitted = await Promise.all([intake(a),intake(a),intake(b)]);
    assert.deepEqual(submitted.map(r=>r.code).sort(),[200,201,201]);
    const apps = await firestore.collection('consignment_applications').where('dealerId','==',dealerId).get();
    assert.equal(apps.size,2); assert.equal((await firestore.collection('dealer_profiles').where('primaryRepresentativeUid','==',uid).get()).size,1);
    assert.equal((await caseRef.get()).get('revision'),1);
    for (const d of apps.docs) { assert.equal(d.get('sellerEmail'),email); assert.equal(d.get('status'),'pending'); assert.equal(d.get('dealerVerificationCaseId'),caseId); }
    const lots: string[] = [];
    for (const application of [a,b]) {
      const read = await listing({ action:'read',applicationId:application.submissionId });
      assert.equal(read.data.eligible,true);
      const convert = { action:'convert',applicationId:application.submissionId,expectedRevision:read.data.revision,
        applicationFingerprint:read.data.applicationFingerprint,commandId:randomUUID(),reason:'Synthetic independent curation',taxHandling:'requires_confirmation' };
      const converted = await listing(convert); assert.equal(converted.code,201,JSON.stringify(converted.data));
      assert.equal((await listing(convert)).data.replayed,true); lots.push(converted.data.auctionId);
      if (lots.length===1) assert.equal((await firestore.collection('consignment_applications').doc(b.submissionId).get()).get('status'),'pending');
    }
    assert.notEqual(lots[0],lots[1]);
    for (let i=0;i<lots.length;i++) {
      const auctionId=lots[i];
      assert.equal((await callListing(handleSellerDraftNarrative,{auctionId,expectedRevision:0,overviewHeading:`Vehicle ${i}`,overviewParagraphs:[`Independent narrative ${i}`]},seller)).code,200);
      const upload = await callListing(handleSellerDraftUpload,{auctionId,expectedRevision:1,jpegBase64:Buffer.from([255,216,255,0,255,217]).toString('base64')},seller);
      assert.equal(upload.code,201,JSON.stringify(upload.data));
      const read = await callListing(handleSellerDraftRead,{auctionId},seller); assert.equal(read.code,200);
      const media = (await firestore.collection('settings').doc(`media-${auctionId}`).get()).data()!;
      assert.equal(media.overviewHeading,`Vehicle ${i}`); assert.equal(media.overviewParagraphs[0],`Independent narrative ${i}`);
      assert.equal((await firestore.collection('auctions').doc(auctionId).get()).get('sellerDraftRevision'),2);
      assert.equal(projectPublicAuction(auctionId,(await firestore.collection('auctions').doc(auctionId).get()).data()!),null);
      const other={...seller,auth:{verifyIdToken:async()=>({uid:'other',email:'other@example.test',email_verified:true})}};
      assert.equal((await callListing(handleSellerDraftRead,{auctionId},other)).code,404);
    }
    for (const mode of ['expired','suspended']) {
      await profileRef.update(mode==='expired'?{verificationExpiresAt:Date.now()-1}:{verificationStatus:'suspended',verificationExpiresAt:Date.now()+86400000});
      assert.equal((await intake({action:'context'})).data.dealer.status,mode);
      const c=input(mode); assert.equal((await intake(c)).code,409);
      assert.equal((await firestore.collection('consignment_applications').doc(c.submissionId).get()).exists,false);
      for(const auctionId of lots) {
        assert.equal((await callListing(handleSellerDraftNarrative,{auctionId,expectedRevision:2,overviewHeading:'blocked',overviewParagraphs:[]},seller)).code,403);
        assert.equal((await callListing(handleSellerDraftSubmission,{auctionId,expectedRevision:2},seller)).code,403);
      }
    }
    await profileRef.update({verificationStatus:'verified',verificationExpiresAt:Date.now()+86400000});
    assert.equal((await intake({action:'context'})).data.dealer.status,'current');
    assert.equal((await callListing(handleSellerDraftSubmission,{auctionId:lots[0],expectedRevision:2},seller)).code,200);
    assert.equal((await firestore.collection('auctions').doc(lots[0]).get()).get('status'),'pending_review');
    assert.equal((await firestore.collection('auctions').doc(lots[1]).get()).get('status'),'draft');
    assert.equal((await callListing(handleSellerDraftNarrative,{auctionId:lots[0],expectedRevision:3,overviewHeading:'blocked submitted',overviewParagraphs:[]},seller)).code,409);
    // Suspension during intake, before its authoritative profile read, must fail without partial records.
    let conflict=false;
    const concurrent={...seller,firestore:{collection:firestore.collection.bind(firestore),runTransaction:(fn:any)=>firestore.runTransaction(async tx=>{
      const get=tx.get.bind(tx); const wrapped=Object.create(tx);
      wrapped.get=async(ref:any)=>{if(ref.path===profileRef.path&&!conflict){conflict=true;await profileRef.update({verificationStatus:'suspended'});}return get(ref);};
      return fn(wrapped);
    })}};
    const c=input('concurrent'); assert.equal((await intake(c,concurrent)).code,409);
    assert.ok(conflict); assert.equal((await firestore.collection('consignment_applications').doc(c.submissionId).get()).exists,false);
    assert.equal((await firestore.collection('consignments').doc(c.submissionId).get()).exists,false);
    assert.equal((await firestore.collection('dealerVehicleIntakeAudits').doc(c.submissionId).get()).exists,false);
    assert.equal((await firestore.collection('users').doc(uid).get()).get('role'),'bidder');
    for(const auctionId of lots) assert.equal((await firestore.collection('auctions').doc(auctionId).get()).get('dealerId'),dealerId);
  } finally { await deleteApp(app); }
});
