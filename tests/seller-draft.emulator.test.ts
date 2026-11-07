import dispatchAuctionNotifications from '../server/api/dispatch-auction-notifications';
import duplicateAuction from '../server/api/admin-duplicate-auction';
import resetAuctionBids from '../server/api/admin-reset-auction-bids';
import reconcileAuctionClock from '../server/api/reconcile-auction-clock';
import auctionClock from '../server/api/auction-clock';
import retractAuctionBid from '../server/api/admin-retract-auction-bid';
import settleAuction from '../server/api/admin-settle-auction';
import uploadAuctionImage from '../server/api/admin-upload-auction-image';
import saveAuctionMedia from '../server/api/admin-save-auction-media';
import deleteAuction from '../server/api/admin-delete-auction';
import updateAuction from '../server/api/admin-update-auction';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdminServices } from '../server/api/_lib/firebaseAdmin';
import returnToDraft from '../server/api/admin-return-auction-to-draft';
import read from '../server/api/seller-draft-read';
import save from '../server/api/seller-draft-narrative';
import submit from '../server/api/seller-draft-submit';
import upload, { handleSellerDraftUpload } from '../server/api/seller-draft-upload';
import type { Transaction } from 'firebase-admin/firestore';
import media from '../server/api/seller-draft-media';
import auctionComments from '../server/api/auction-comments';
import publicAuctions from '../server/api/public-auctions';
import placeBid from '../server/api/place-auction-bid';
import createAuction from '../server/api/admin-create-auction';

const projectId = 'demo-wailtail-stage3';
const bucket = `${projectId}.appspot.com`;

function emulatorHost(name: string) {
  const value = process.env[name];
  const match = /^127\.0\.0\.1:(\d{1,5})$/.exec(value ?? '');
  assert.ok(value && match && Number(match[1]) > 0 && Number(match[1]) <= 65535,
    `${name} must be a loopback emulator address`);
  return value;
}

test('trusted seller lifecycle on isolated Auth, Firestore and Storage emulators', async () => {
  const authHost = emulatorHost('FIREBASE_AUTH_EMULATOR_HOST');
  const firestoreHost = emulatorHost('FIRESTORE_EMULATOR_HOST');
  const storageHost = emulatorHost('FIREBASE_STORAGE_EMULATOR_HOST');
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  for (const name of ['GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID']) {
    assert.ok(!process.env[name] || process.env[name] === projectId, `Conflicting project: ${name}`);
  }
  for (const name of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_KEY',
    'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL']) {
    assert.ok(!process.env[name], `Unset ${name} before running this suite`);
  }
  assert.ok(!process.env.STORAGE_EMULATOR_HOST ||
    process.env.STORAGE_EMULATOR_HOST === `http://${storageHost}`);
  assert.ok(!process.env.FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET === bucket);
  process.env.STORAGE_EMULATOR_HOST = `http://${storageHost}`;
  process.env.FIREBASE_STORAGE_BUCKET = bucket;

  // Confirm all three listeners before initializing Admin or writing fixtures.
  await Promise.all([authHost, firestoreHost, storageHost].map(async host => {
    await fetch(`http://${host}/`, { redirect: 'error', signal: AbortSignal.timeout(3000) });
  }));

  const app = initializeApp({ projectId, storageBucket: bucket });
  try {
    const { auth, firestore } = getFirebaseAdminServices();
    const run = randomUUID();
    const auctionId = `stage3-${run}`;
    const unassignedId = `legacy-${run}`;
    const identity = { status: 'draft', title: 'Synthetic vehicle', make: 'Test', model: 'Fixture', year: 2000 };

    async function seller(label: string, email = `${label}-${run}@example.test`) {
      const password = `Synthetic-${run}`;
      const { uid } = await auth.createUser({ email, password, emailVerified: true });
      const result = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
        redirect: 'error'
      });
      assert.equal(result.status, 200);
      const { idToken } = await result.json();
      assert.equal(typeof idToken, 'string');
      return { uid, email, idToken };
    }

    const owner = await seller('owner');
    const other = await seller('other');
    const auction = firestore.collection('auctions').doc(auctionId);
    const narrative = firestore.collection('settings').doc(`media-${auctionId}`);
    await auction.set({ ...identity, sellerId: owner.uid, sellerEmail: other.email });
    await firestore.collection('auctions').doc(unassignedId).set({ ...identity, sellerEmail: other.email });

    async function invoke(handler: typeof read, body: object, token?: string, method = 'POST', query?: object) {
      let status = 0;
      let payload: unknown;
      const response = {
        setHeader() {},
        status(code: number) { status = code; return this; },
        json(value: unknown) { payload = value; },
        send(value: unknown) { payload = value; }
      };
      await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body, query }, response);
      return { status, payload };
    }

    const publicId = `public-${run}`;
    const publicRef = firestore.collection('auctions').doc(publicId);
    const now = Date.now();
    await publicRef.set({
      status: 'active', title: 'Synthetic public vehicle', startTime: now - 60_000, endTime: now + 90_000,
      startingBid: 1000, currentBid: 0, minimumIncrement: 250, reserveAmount: 5000, sellerEmail: other.email
    });
    await firestore.collection('settings').doc(`media-${publicId}`).set({
      fullGallery: [{ id: 'image', url: 'https://example.test/image.jpg', privateField: other.email }]
    });
    await firestore.collection('comments').doc(publicId).set({
      auctionId: publicId, text: 'Synthetic comment', userEmail: other.email, timestamp: now
    });
    assert.equal((await invoke(publicAuctions, {}, undefined, 'GET', { auctionId })).status, 404);
    assert.equal((await invoke(placeBid, { auctionId: publicId, amount: 1000 })).status, 401);
    assert.equal((await invoke(placeBid, { auctionId: publicId, amount: 999 }, other.idToken)).status, 409);
    assert.equal((await publicRef.get()).get('currentBid'), 0);
    const bid = await invoke(placeBid, { auctionId: publicId, amount: 1000 }, other.idToken);
    assert.equal(bid.status, 200);
    assert.equal((await publicRef.get()).get('highBidderId'), other.uid);
    const detail = await invoke(publicAuctions, {}, undefined, 'GET', { auctionId: publicId });
    assert.equal(detail.status, 200);
    const view = detail.payload as any;
    assert.equal(view.auction.currentBid, 1000);
    assert.equal(view.auction.reserveAmount, undefined);
    assert.equal(view.auction.sellerEmail, undefined);
    assert.deepEqual(view.media.fullGallery, [{ id: 'image', url: 'https://example.test/image.jpg' }]);
    assert.equal(view.bids.length, 1);
    assert.equal(view.bids[0].bidderEmail, undefined);
    assert.equal(view.comments.length, 2);
    assert.ok(view.comments.every((comment: any) => comment.userEmail === undefined));
    assert.equal((await invoke(createAuction, { title: 'Unauthorized' }, other.idToken)).status, 403);

    const posted = await invoke(auctionComments, {
      action: 'post', auctionId: publicId, text: 'Verified test comment', userId: owner.uid
    }, other.idToken);
    assert.equal(posted.status, 201);
    const { id: commentId } = posted.payload as { id: string };
    const comment = firestore.collection('comments').doc(commentId);
    assert.equal((await comment.get()).get('userId'), other.uid);
    assert.equal((await invoke(auctionComments, { action: 'edit', commentId, text: 'Denied' }, owner.idToken)).status, 403);
    assert.equal((await invoke(auctionComments, { action: 'edit', commentId, text: 'Edited' }, other.idToken)).status, 200);
    assert.equal((await invoke(auctionComments, { action: 'vote', commentId }, other.idToken)).status, 200);
    const viewer = await invoke(publicAuctions, {}, other.idToken, 'GET', { auctionId: publicId });
    const ownComment = (viewer.payload as any).comments.find((entry: any) => entry.id === commentId);
    assert.equal(ownComment.userId, other.uid);
    assert.deepEqual(ownComment.upvotedBy, [other.uid]);
    const anonymous = await invoke(publicAuctions, {}, undefined, 'GET', { auctionId: publicId });
    const anonymousComment = (anonymous.payload as any).comments.find((entry: any) => entry.id === commentId);
    assert.equal(anonymousComment.userId, undefined);
    assert.equal(anonymousComment.upvotedBy, undefined);
    assert.equal((await invoke(auctionComments, { action: 'delete', commentId }, other.idToken)).status, 200);
    assert.equal((await comment.get()).exists, false);

    const clockId = `clock-${run}`;
    const clockRef = firestore.collection('auctions').doc(clockId);
    await clockRef.set({ status: 'upcoming', startTime: Date.now() + 60000, endTime: Date.now() + 120000,
      reserveAmount: 1000, currentBid: 0, startingBid: 1000, minimumIncrement: 250 });
    assert.equal((await invoke(auctionClock, { auctionId: clockId, now: Date.now() + 180000 })).status, 422);
    assert.equal((await invoke(auctionClock, { auctionId: clockId })).status, 409);
    assert.equal((await clockRef.get()).get('status'), 'upcoming');
    await clockRef.update({ startTime: Date.now() - 60000 });
    assert.equal((await invoke(auctionClock, { auctionId: clockId })).status, 200);
    assert.equal((await clockRef.get()).get('status'), 'active');
    assert.equal((await invoke(auctionClock, { auctionId: clockId })).status, 409);
    await clockRef.collection('bids').doc('winner').set({
      amount: 1250, bidderId: other.uid, bidderEmail: other.email, timestamp: now, bidderName: 'Test bidder'
    });
    await clockRef.update({ endTime: Date.now() - 1 });
    const clockResults = await Promise.all([
      invoke(auctionClock, { auctionId: clockId }), invoke(auctionClock, { auctionId: clockId })
    ]);
    assert.ok(clockResults.every(result => result.status === 200));
    assert.equal((await clockRef.get()).get('status'), 'sold');
    const clockMail = firestore.collection('auctionNotificationOutbox').doc(`auction-winner-${clockId}`);
    assert.equal((await clockMail.get()).exists, true);
    const clockMailTime = (await clockMail.get()).get('createdAt');
    assert.equal((await invoke(auctionClock, { auctionId: clockId })).status, 200);
    assert.equal((await clockMail.get()).get('createdAt'), clockMailTime);
    assert.equal((await invoke(auctionClock, { auctionId })).status, 409);
    assert.equal((await auction.get()).get('status'), 'draft');

    const originalCronSecret = process.env.CRON_SECRET;
    const workerSecret = `synthetic-worker-${run}`;
    try {
      delete process.env.CRON_SECRET;
      assert.equal((await invoke(reconcileAuctionClock, {}, undefined, 'GET')).status, 503);
      process.env.CRON_SECRET = workerSecret;
      assert.equal((await invoke(reconcileAuctionClock, {}, undefined, 'GET')).status, 401);
      assert.equal((await invoke(reconcileAuctionClock, {}, other.idToken, 'GET')).status, 401);
      const expiredRef = firestore.collection('auctions').doc(`worker-expired-${run}`);
      const startingRef = firestore.collection('auctions').doc(`worker-starting-${run}`);
      await expiredRef.set({ status: 'active', startTime: Date.now() - 60000, endTime: Date.now() - 1000,
        currentBid: 0, reserveAmount: 1000 });
      await startingRef.set({ status: 'upcoming', startTime: Date.now() - 1000, endTime: Date.now() + 60000 });
      const drained = await invoke(reconcileAuctionClock, {}, workerSecret, 'GET');
      assert.equal(drained.status, 200);
      assert.equal((drained.payload as any).pending, 0);
      assert.equal((await expiredRef.get()).get('status'), 'ended');
      assert.equal((await startingRef.get()).get('status'), 'active');
      const workerSettledAt = (await expiredRef.get()).get('settlementCompletedAt');
      assert.equal((await invoke(reconcileAuctionClock, {}, workerSecret, 'GET')).status, 200);
      assert.equal((await expiredRef.get()).get('settlementCompletedAt'), workerSettledAt);
      assert.equal((await auction.get()).get('status'), 'draft');
    } finally {
      if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = originalCronSecret;
    }

    const command = { auctionId, expectedRevision: 0 };
    const patch = { ...command, overviewHeading: 'Synthetic overview', overviewParagraphs: ['Test paragraph'] };
    assert.equal((await invoke(read, { auctionId })).status, 401);
    assert.equal((await invoke(read, { auctionId }, other.idToken)).status, 404);
    assert.equal((await invoke(save, patch, other.idToken)).status, 404);
    assert.equal((await invoke(save, { ...patch, auctionId: unassignedId }, other.idToken)).status, 404);
    assert.equal((await invoke(save, { ...patch, reserveAmount: 1 }, owner.idToken)).status, 422);
    assert.equal((await narrative.get()).exists, false);
    assert.equal((await invoke(read, { auctionId }, owner.idToken)).status, 200);
    assert.equal((await invoke(save, patch, owner.idToken)).status, 200);
    assert.equal((await narrative.get()).get('overviewHeading'), patch.overviewHeading);
    assert.equal((await invoke(save, patch, owner.idToken)).status, 409);

    // Marker-only fixture exercises transport and authorization, not JPEG decoding.
    const jpeg = Buffer.from([255, 216, 255, 224, 255, 217]);
    async function addImage(expectedRevision: number) {
      const result = await invoke(upload, { auctionId, expectedRevision, jpegBase64: jpeg.toString('base64') }, owner.idToken);
      assert.equal(result.status, 201, JSON.stringify(result.payload));
      const { assetId, revision } = result.payload as { assetId: string; revision: number };
      assert.equal(revision, expectedRevision + 1);
      return assetId;
    }

    const assetId = await addImage(1);
    const objectPath = `auctionDraft/${auctionId}/${assetId}`;
    assert.equal((await getStorage(app).bucket(bucket).file(objectPath).exists())[0], true);
    const storageUrl = `http://${storageHost}/v0/b/${bucket}/o`;
    function getObject(path: string, token?: string) {
      return fetch(`${storageUrl}/${encodeURIComponent(path)}?alt=media`, {
        headers: token ? { Authorization: `Firebase ${token}` } : {},
        redirect: 'error'
      });
    }

    async function assertDenied(response: Response, label: string) {
      assert.ok([401, 403].includes(response.status), `${label}: expected permission denial, got ${response.status}`);
    }

    const beforeFault = await auction.get();
    const beforeAssets = await auction.collection('draftAssets').get();
    const bucketForFault = getStorage(app).bucket(bucket);
    const prefix = `auctionDraft/${auctionId}/`;
    const [beforeObjects] = await bucketForFault.getFiles({ prefix });
    let stagedRegistration = false;
    const abortingFirestore = new Proxy(firestore, {
      get(target, key) {
        if (key === 'runTransaction') {
          return (operation: (transaction: Transaction) => Promise<number>) =>
            target.runTransaction(async transaction => {
              const result = await operation(transaction);
              stagedRegistration = result === 200;
              throw new Error('Synthetic registration transaction abort');
            });
        }
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
    const failed = await invoke((req, res) => handleSellerDraftUpload(req, res, {
      app, auth, firestore: abortingFirestore
    }), {
      auctionId, expectedRevision: beforeFault.get('sellerDraftRevision'), jpegBase64: jpeg.toString('base64')
    }, owner.idToken);
    assert.equal(failed.status, 503);
    assert.equal(stagedRegistration, true);
    assert.deepEqual((await auction.get()).data(), beforeFault.data());
    assert.deepEqual((await auction.collection('draftAssets').get()).docs.map(doc => doc.id),
      beforeAssets.docs.map(doc => doc.id));
    const [afterObjects] = await bucketForFault.getFiles({ prefix });
    const previousNames = new Set(beforeObjects.map(file => file.name));
    const unattached = afterObjects.filter(file => !previousNames.has(file.name));
    assert.equal(unattached.length, 1);
    await assertDenied(await getObject(unattached[0].name), 'unattached upload public read');
    await assertDenied(await getObject(unattached[0].name, owner.idToken), 'unattached upload direct seller read');
    const unregisteredId = unattached[0].name.slice(prefix.length);
    assert.equal((await invoke(media, { auctionId, assetId: unregisteredId, action: 'preview' }, owner.idToken)).status, 404);

    // Rehearse removal of the exact synthetic object from the aborted upload.
    // Never infer that an arbitrary unregistered object is safe to delete.
    assert.equal((await auction.collection('draftAssets').doc(unregisteredId).get()).exists, false);
    const [metadata] = await unattached[0].getMetadata();
    const generation = Number(metadata.generation);
    assert.ok(Number.isSafeInteger(generation) && generation > 0, 'orphan must have a known generation');
    await unattached[0].delete({ ifGenerationMatch: generation });
    assert.equal((await unattached[0].exists())[0], false);
    assert.equal((await bucketForFault.file(objectPath).exists())[0], true);
    assert.deepEqual(await invoke(media, { auctionId, assetId, action: 'preview' }, owner.idToken),
      { status: 200, payload: jpeg });
    assert.deepEqual((await auction.get()).data(), beforeFault.data());

    const publicPaths = [
      `auctionPublic/${auctionId}/asset`,
      `auctionPublic/${auctionId}/branding-fixture`,
      `auctionPublic/${auctionId}/promotion-fixture`,
      'auctions/1988-porsche-928-c3uyca60/gallery/1792949925577-tjvc0.jpg',
      'auctions/2019-ram-rebel-3a0455wx/gallery/1793403168695-t0pxg.jpg'
    ];
    const privatePaths = [
      objectPath,
      `applicationPrivate/${auctionId}/asset`,
      'auctions/1988-porsche-928-c3uyca60/gallery/unapproved.pdf',
      `auctions/${auctionId}/branding/legacy-logo.jpg`,
      `auctions/${auctionId}/promotions/legacy-promo.jpg`
    ];
    const storageBucket = getStorage(app).bucket(bucket);
    await Promise.all([...publicPaths, ...privatePaths.slice(1)].map(path =>
      storageBucket.file(path).save(jpeg, { resumable: false, contentType: 'image/jpeg' })
    ));

    for (const path of publicPaths) {
      const response = await getObject(path);
      assert.equal(response.status, 200, `anonymous public read: ${path}`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
    }
    for (const path of privatePaths) {
      await assertDenied(await getObject(path), `anonymous private read: ${path}`);
      await assertDenied(await getObject(path, owner.idToken), `seller direct private read: ${path}`);
    }
    await assertDenied(await getObject(objectPath, other.idToken), 'unrelated seller direct draft read');

    // Multipart format mirrors the Firebase client upload transport.
    const boundary = 'stage3-rules-fixture';
    for (const token of [undefined, owner.idToken, other.idToken]) {
      const authorization = token ? { Authorization: `Firebase ${token}` } : {};
      for (const path of [`auctionDraft/${auctionId}/direct-upload`, publicPaths[0]]) {
        const body = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify({ name: path, contentType: 'image/jpeg' })}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
          jpeg,
          Buffer.from(`\r\n--${boundary}--\r\n`)
        ]);
        await assertDenied(await fetch(`${storageUrl}?name=${encodeURIComponent(path)}`, {
          method: 'POST', redirect: 'error',
          headers: { ...authorization, 'X-Goog-Upload-Protocol': 'multipart',
            'Content-Type': `multipart/related; boundary=${boundary}` },
          body
        }), `direct upload: ${path}`);
      }
      for (const path of [objectPath, publicPaths[0]]) {
        await assertDenied(await fetch(`${storageUrl}/${encodeURIComponent(path)}`, {
          method: 'DELETE', redirect: 'error', headers: authorization
        }), `direct delete: ${path}`);
        assert.equal((await storageBucket.file(path).exists())[0], true);
      }
    }
    assert.equal((await storageBucket.file(`auctionDraft/${auctionId}/direct-upload`).exists())[0], false);
    const preview = { auctionId, assetId, action: 'preview' };
    assert.equal((await invoke(media, preview, other.idToken)).status, 404);
    assert.deepEqual(await invoke(media, preview, owner.idToken), { status: 200, payload: jpeg });
    assert.equal((await invoke(media, { ...preview, action: 'remove', expectedRevision: 2 }, owner.idToken)).status, 200);
    assert.equal((await invoke(media, preview, owner.idToken)).status, 404);
    const retainedId = await addImage(3);

    const submission = { auctionId, expectedRevision: 4 };
    assert.equal((await invoke(submit, submission, other.idToken)).status, 404);
    assert.equal((await invoke(submit, submission, owner.idToken)).status, 200);
    assert.equal((await auction.get()).get('status'), 'pending_review');
    const event = firestore.collection('auctionReviewOutbox').doc(auctionId).collection('events').doc('5');
    assert.equal((await event.get()).get('status'), 'queued');
    assert.equal((await invoke(submit, submission, owner.idToken)).status, 409);
    assert.equal((await invoke(save, { ...patch, expectedRevision: 5 }, owner.idToken)).status, 409);
    assert.equal((await invoke(upload, { ...submission, expectedRevision: 5, jpegBase64: jpeg.toString('base64') }, owner.idToken)).status, 409);
    assert.equal((await invoke(media, { ...preview, assetId: retainedId, action: 'remove', expectedRevision: 5 }, owner.idToken)).status, 409);
    const reopen = { auctionId, expectedRevision: 5, notes: 'Check the overview.' };
    assert.equal((await invoke(returnToDraft, reopen, owner.idToken)).status, 403);
    assert.equal((await auction.get()).get('status'), 'pending_review');
    for (const [index, email] of ['jeremygoodmurphy@gmail.com', 'jeremy@theinnovativegroup.ca'].entries()) {
      const admin = await seller('admin', email);
      if (index === 0) {
        const created = await invoke(createAuction, { title: 'Synthetic inventory draft' }, admin.idToken);
        assert.equal(created.status, 201);
        const { auction: createdAuction } = created.payload as { auction: { id: string; status: string } };
        assert.equal(createdAuction.status, 'draft');
        assert.equal((await firestore.collection('settings').doc(`media-${createdAuction.id}`).get()).exists, true);
        const edit = { auctionId: createdAuction.id, updates: { title: 'Edited inventory draft' } };
        assert.equal((await invoke(updateAuction, edit, other.idToken)).status, 403);
        assert.equal((await invoke(updateAuction, { ...edit, updates: { sellerId: other.uid } }, admin.idToken)).status, 422);
        assert.equal((await invoke(updateAuction, edit, admin.idToken)).status, 200);
        const edited = await firestore.collection('auctions').doc(createdAuction.id).get();
        assert.equal(edited.get('title'), 'Edited inventory draft');
        assert.equal(edited.get('sellerId'), undefined);
        const image = { auctionId: publicId, dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` };
        assert.equal((await invoke(uploadAuctionImage, image, other.idToken)).status, 403);
        assert.equal((await invoke(uploadAuctionImage, { ...image, auctionId: createdAuction.id }, admin.idToken)).status, 409);
        assert.equal((await invoke(uploadAuctionImage, { ...image, dataUrl: 'data:image/jpeg;base64,YQ==' }, admin.idToken)).status, 422);
        const uploaded = await invoke(uploadAuctionImage, image, admin.idToken);
        assert.equal(uploaded.status, 201);
        const { url: hero } = uploaded.payload as { url: string };
        assert.equal(new URL(hero).host, storageHost);
        const publicImage = await fetch(hero, { redirect: 'error' });
        assert.equal(publicImage.status, 200);
        assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()), jpeg);
        const gallery = {
          auctionId: createdAuction.id,
          config: { heroImages: [hero], fullGallery: [{ id: 'example', url: hero, sellerEmail: other.email }] }
        };
        assert.equal((await invoke(saveAuctionMedia, gallery, other.idToken)).status, 403);
        assert.equal((await invoke(saveAuctionMedia, gallery, admin.idToken)).status, 200);
        assert.equal((await edited.ref.get()).get('leadHeroImage'), hero);
        const savedGallery = await firestore.collection('settings').doc(`media-${createdAuction.id}`).get();
        assert.deepEqual(savedGallery.get('fullGallery'), [{ id: 'example', url: hero }]);

        const sourceRef = firestore.collection('auctions').doc(`duplicate-source-${run}`);
        await sourceRef.set({ title: 'Completed source', status: 'sold', currentBid: 5000, bidCount: 3,
          startingBid: 1000, reserveAmount: 5000, isReserveMet: true, sellerId: owner.uid, winningEmailSent: true, settlementCompletedAt: 123,
          winnerNotificationQueuedAt: 123, watchlist: [other.uid], highBidderEmail: other.email });
        await firestore.collection('settings').doc(`media-${sourceRef.id}`).set({ heroImages: [hero], fullGallery: [] });
        assert.equal((await invoke(duplicateAuction, { auctionId: sourceRef.id }, other.idToken)).status, 403);
        assert.equal((await invoke(duplicateAuction, { auctionId: 'missing-duplicate-source' }, admin.idToken)).status, 404);
        const duplicated = await invoke(duplicateAuction, { auctionId: sourceRef.id }, admin.idToken);
        assert.equal(duplicated.status, 201);
        const copied = (duplicated.payload as any).auction;
        assert.notEqual(copied.id, sourceRef.id);
        assert.equal(copied.status, 'draft');
        assert.equal(copied.currentBid, 0);
        assert.equal(copied.bidCount, 0);
        assert.equal(copied.isReserveMet, false);
        assert.equal(copied.sellerId, owner.uid);
        assert.equal(copied.settlementCompletedAt, undefined);
        assert.equal(copied.winningEmailSent, undefined);
        assert.equal(copied.watchlist, undefined);
        assert.equal(copied.highBidderEmail, '');
        assert.deepEqual((await firestore.collection('settings').doc(`media-${copied.id}`).get()).get('heroImages'), [hero]);
        assert.equal((await sourceRef.get()).get('status'), 'sold');

        const resetRef = firestore.collection('auctions').doc(`reset-target-${run}`);
        await resetRef.set({ status: 'active', currentBid: 2500, bidCount: 1, startingBid: 1000 });
        const resetBidId = `reset-bid-${run}`;
        const rootResetBid = firestore.collection('bids').doc(resetBidId);
        await rootResetBid.set({ auctionId: resetRef.id, amount: 2500 });
        await resetRef.collection('bids').doc(resetBidId).set({ auctionId: resetRef.id, amount: 2500 });
        const bidComment = firestore.collection('comments').doc(resetBidId);
        const ordinaryComment = firestore.collection('comments').doc(`reset-ordinary-${run}`);
        await bidComment.set({ auctionId: resetRef.id, isBid: true });
        await ordinaryComment.set({ auctionId: resetRef.id, text: 'Preserved ordinary comment' });
        const foreignBidCount = (await firestore.collection('bids').where('auctionId', '==', publicId).get()).size;
        const reset = { auctionId: resetRef.id, startingBid: 1500 };
        assert.equal((await invoke(resetAuctionBids, reset, other.idToken)).status, 403);
        assert.equal((await rootResetBid.get()).exists, true);
        assert.equal((await invoke(resetAuctionBids, { auctionId: sourceRef.id }, admin.idToken)).status, 409);
        assert.equal((await invoke(resetAuctionBids, reset, admin.idToken)).status, 200);
        assert.equal((await rootResetBid.get()).exists, false);
        assert.equal((await resetRef.collection('bids').doc(resetBidId).get()).exists, false);
        assert.equal((await bidComment.get()).exists, false);
        assert.equal((await ordinaryComment.get()).exists, true);
        assert.equal((await resetRef.get()).get('currentBid'), 0);
        assert.equal((await resetRef.get()).get('startingBid'), 1500);
        assert.equal((await firestore.collection('bids').where('auctionId', '==', publicId).get()).size, foreignBidCount);
        assert.equal((await invoke(resetAuctionBids, reset, admin.idToken)).status, 200);

        const bulk = { auctionIds: [createdAuction.id, 'missing-inventory-lot'], updates: { status: 'preview' } };
        assert.equal((await invoke(updateAuction, bulk, other.idToken)).status, 403);
        assert.equal((await invoke(updateAuction, bulk, admin.idToken)).status, 404);
        assert.equal((await edited.ref.get()).get('status'), 'draft');
        assert.equal((await firestore.collection('auctions').doc('missing-inventory-lot').get()).exists, false);
        assert.equal((await invoke(updateAuction, {
          auctionIds: [createdAuction.id, publicId, createdAuction.id], updates: { status: 'preview' }
        }, admin.idToken)).status, 200);
        assert.equal((await edited.ref.get()).get('status'), 'preview');
        assert.equal((await publicRef.get()).get('status'), 'preview');
        const related = firestore.collection('comments').doc(createdAuction.id);
        await related.set({ auctionId: createdAuction.id, text: 'Related comment' });
        const removal = { auctionId: createdAuction.id, cascadeDeleteConsignment: false };
        assert.equal((await invoke(deleteAuction, removal, other.idToken)).status, 403);
        assert.equal((await related.get()).exists, true);
        assert.equal((await invoke(deleteAuction, removal, admin.idToken)).status, 200);
        assert.equal((await edited.ref.get()).exists, false);
        assert.equal((await related.get()).exists, false);
        assert.equal((await publicRef.get()).exists, true);
        assert.equal((await firestore.collection('comments').doc(publicId).get()).exists, true);
        assert.equal((await invoke(auctionComments, { action: 'pin', commentId: publicId, pinned: true }, other.idToken)).status, 403);
        assert.equal((await invoke(auctionComments, { action: 'pin', commentId: publicId, pinned: true }, admin.idToken)).status, 200);
        assert.equal((await firestore.collection('comments').doc(publicId).get()).get('isPinned'), true);
        await publicRef.update({ status: 'active', endTime: Date.now() + 120000 });
        assert.equal((await invoke(placeBid, { auctionId: publicId, amount: 1250 }, owner.idToken)).status, 200);
        const higher = await publicRef.collection('bids').where('amount', '==', 1250).get();
        assert.equal(higher.size, 1);
        const retraction = { auctionId: publicId, bidId: higher.docs[0].id, reason: 'Synthetic verification' };
        assert.equal((await invoke(retractAuctionBid, retraction, other.idToken)).status, 403);
        assert.equal((await publicRef.get()).get('currentBid'), 1250);
        assert.equal((await invoke(retractAuctionBid, { ...retraction, auctionId }, admin.idToken)).status, 409);
        assert.equal((await invoke(retractAuctionBid, retraction, admin.idToken)).status, 200);
        assert.equal((await publicRef.get()).get('currentBid'), 1000);
        assert.equal((await publicRef.get()).get('bidCount'), 1);
        const retracted = await higher.docs[0].ref.get();
        assert.equal(retracted.get('retractedBy'), admin.uid);
        assert.equal((await firestore.collection('bids').doc(retraction.bidId).get()).get('status'), 'retracted');
        assert.equal((await invoke(retractAuctionBid, retraction, admin.idToken)).status, 200);
        assert.equal((await higher.docs[0].ref.get()).get('retractedAt'), retracted.get('retractedAt'));

        const settlement = { auctionId: publicId };
        assert.equal((await invoke(settleAuction, settlement, other.idToken)).status, 403);
        assert.equal((await invoke(settleAuction, settlement, admin.idToken)).status, 409);
        await publicRef.update({ status: 'ended', reserveAmount: 1000 });
        await publicRef.collection('bids').doc('retracted').set({ status: 'retracted', amount: 9000 });
        assert.deepEqual(await invoke(settleAuction, settlement, admin.idToken), {
          status: 200, payload: { success: true, settled: true }
        });
        const settled = await publicRef.get();
        assert.equal(settled.get('status'), 'sold');
        assert.equal(settled.get('currentBid'), 1000);
        const notification = firestore.collection('auctionNotificationOutbox').doc(`auction-winner-${publicId}`);
        assert.deepEqual((await notification.get()).get('to'), [other.email]);
        const queuedAt = (await notification.get()).get('createdAt');
        assert.deepEqual(await invoke(settleAuction, settlement, admin.idToken), {
          status: 200, payload: { success: true, settled: false }
        });
        assert.equal((await notification.get()).get('createdAt'), queuedAt);
        assert.equal((await firestore.collection('settings').doc(`media-${createdAuction.id}`).get()).exists, false);
        assert.equal((await invoke(publicAuctions, {}, undefined, 'GET', { auctionId: createdAuction.id })).status, 404);
      }
      const expectedRevision = 5 + index * 2;
      const command = { ...reopen, expectedRevision };
      assert.equal((await invoke(returnToDraft, { ...command, expectedRevision: expectedRevision - 1 }, admin.idToken)).status, 409);
      assert.deepEqual(await invoke(returnToDraft, command, admin.idToken), {
        status: 200, payload: { status: 'draft', revision: expectedRevision + 1 }
      });
      const record = await auction.get();
      assert.equal(record.get('sellerId'), owner.uid);
      assert.equal(record.get('status'), 'draft');
      const history = await auction.collection('reviewHistory').doc(String(expectedRevision + 1)).get();
      assert.equal(history.get('administratorUid'), admin.uid);
      assert.equal((await invoke(returnToDraft, command, admin.idToken)).status, 409);
      if (index === 0) {
        assert.equal((await invoke(submit, { auctionId, expectedRevision: expectedRevision + 1 }, owner.idToken)).status, 200);
      }
    }
    assert.equal((await invoke(save, { ...patch, expectedRevision: 8 }, owner.idToken)).status, 200);

    const originalFetch = globalThis.fetch;
    const originalCron = process.env.CRON_SECRET;
    const originalApiKey = process.env.RESEND_API_KEY;
    const originalRunTransaction = firestore.runTransaction.bind(firestore);
    const deliveryRequests: Array<{ key: string; body: string }> = [];
    let failNextDelivery = true;
    try {
      process.env.CRON_SECRET = `synthetic-delivery-${run}`;
      process.env.RESEND_API_KEY = 'synthetic-api-key';
      globalThis.fetch = async (input, init) => {
        if (String(input) !== 'https://api.resend.com/emails') return originalFetch(input, init);
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('Authorization'), 'Bearer synthetic-api-key');
        const key = headers.get('Idempotency-Key');
        assert.ok(key);
        deliveryRequests.push({ key, body: String(init?.body) });
        if (failNextDelivery) {
          failNextDelivery = false;
          return new Response('{}', { status: 503 });
        }
        return new Response(JSON.stringify({ id: `provider-${key}` }), { status: 200 });
      };
      assert.equal((await invoke(dispatchAuctionNotifications, {}, undefined, 'GET')).status, 401);
      assert.equal(deliveryRequests.length, 0);
      const secret = process.env.CRON_SECRET;
      assert.equal((await invoke(dispatchAuctionNotifications, {}, secret, 'GET')).status, 503);
      const first = deliveryRequests[0];
      assert.ok(first);
      const pendingNotification = await firestore.collection('auctionNotificationOutbox').where('status', '==', 'queued').get();
      assert.equal(pendingNotification.size, 1);
      let loseAcknowledgement = true;
      firestore.runTransaction = async (...args: Parameters<typeof originalRunTransaction>) => {
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          throw new Error('Synthetic failure after provider acceptance');
        }
        return originalRunTransaction(...args);
      };
      assert.equal((await invoke(dispatchAuctionNotifications, {}, secret, 'GET')).status, 503);
      firestore.runTransaction = originalRunTransaction;
      assert.equal((await invoke(dispatchAuctionNotifications, {}, secret, 'GET')).status, 200);
      const retries = deliveryRequests.filter(request => request.key === first.key);
      assert.equal(retries.length, 3);
      assert.ok(retries.every(request => request.body === first.body));
      assert.equal((await pendingNotification.docs[0].ref.get()).get('status'), 'accepted');
      assert.equal((await publicRef.get()).get('winningEmailSent'), true);
      const requestsAfterAcceptance = deliveryRequests.length;
      assert.equal((await invoke(dispatchAuctionNotifications, {}, secret, 'GET')).status, 200);
      assert.equal(deliveryRequests.length, requestsAfterAcceptance);
      const oldNotification = firestore.collection('auctionNotificationOutbox').doc(`expired-${run}`);
      await oldNotification.set({ ...pendingNotification.docs[0].data(), status: 'queued', createdAt: Date.now() - 3600001 });
      assert.equal((await invoke(dispatchAuctionNotifications, {}, secret, 'GET')).status, 503);
      assert.equal((await oldNotification.get()).get('status'), 'reconciliation_required');
      assert.equal(deliveryRequests.length, requestsAfterAcceptance);
    } finally {
      globalThis.fetch = originalFetch;
      firestore.runTransaction = originalRunTransaction;
      if (originalCron === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = originalCron;
      if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = originalApiKey;
    }

  } finally {
    await deleteApp(app);
  }
});
