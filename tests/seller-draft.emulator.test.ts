import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdminServices } from '../api/_lib/firebaseAdmin';
import returnToDraft from '../api/admin-return-auction-to-draft';
import read from '../api/seller-draft-read';
import save from '../api/seller-draft-narrative';
import submit from '../api/seller-draft-submit';
import upload, { handleSellerDraftUpload } from '../api/seller-draft-upload';
import type { Transaction } from 'firebase-admin/firestore';
import media from '../api/seller-draft-media';

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

    async function invoke(handler: typeof read, body: object, token?: string) {
      let status = 0;
      let payload: unknown;
      const response = {
        setHeader() {},
        status(code: number) { status = code; return this; },
        json(value: unknown) { payload = value; },
        send(value: unknown) { payload = value; }
      };
      await handler({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body }, response);
      return { status, payload };
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
  } finally {
    await deleteApp(app);
  }
});
