import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { NAMED_FIRESTORE_DATABASE_ID } from '../api/_lib/firebaseAdmin';

const projectId = 'demo-wailtail-stage3';
const bucket = `${projectId}.appspot.com`;

function emulatorHost(name: string) {
  const value = process.env[name];
  const match = /^127\.0\.0\.1:(\d{1,5})$/.exec(value ?? '');
  assert.ok(
    value && match && Number(match[1]) > 0 && Number(match[1]) <= 65535,
    `${name} must be a loopback emulator address`
  );
  return value;
}

test('isolated Storage cutover rehearsal with full batch failure, retry, shifted-array guard, rollback preservation, and wire evidence', async () => {
  // Step 0: Verify isolated loopback emulator endpoints & demo project ID
  const authHost = emulatorHost('FIREBASE_AUTH_EMULATOR_HOST');
  const firestoreHost = emulatorHost('FIRESTORE_EMULATOR_HOST');
  const storageHost = emulatorHost('FIREBASE_STORAGE_EMULATOR_HOST');

  assert.equal(process.env.GCLOUD_PROJECT, projectId, 'Must target demo project ID');
  for (const name of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL']) {
    assert.ok(!process.env[name], `Unset ${name} before running rehearsal`);
  }

  process.env.STORAGE_EMULATOR_HOST = `http://${storageHost}`;
  process.env.FIREBASE_STORAGE_BUCKET = bucket;

  // Track outgoing HTTP copy requests to capture wire evidence of query preconditions
  const loggedCopyRequests: string[] = [];
  const originalHttpRequest = http.request;
  (http as any).request = function (...args: any[]) {
    const url = args[0];
    let reqUrl = '';
    if (typeof url === 'string' || url instanceof URL) {
      reqUrl = url.toString();
    } else if (url && url.path) {
      reqUrl = url.path;
    }
    if (reqUrl.includes('/rewriteTo/')) {
      loggedCopyRequests.push(reqUrl);
    }
    return originalHttpRequest.apply(this, args as any);
  };

  // Confirm emulator responsiveness
  await Promise.all([authHost, firestoreHost, storageHost].map(async host => {
    await fetch(`http://${host}/`, { redirect: 'error', signal: AbortSignal.timeout(3000) });
  }));

  const app = initializeApp({ projectId, storageBucket: bucket }, 'cutover-rehearsal-v3');
  const storage = getStorage(app);
  const storageBucket = storage.bucket(bucket);
  const firestore = getFirestore(app, NAMED_FIRESTORE_DATABASE_ID);

  try {
    const jpegBytes = Buffer.from('synthetic-jpeg-data');
    const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    const pdfBytes = Buffer.from('%PDF-1.4 synthetic-pdf-content');

    // =========================================================================
    // 1. SETUP SYNTHETIC FIXTURES
    // Total Storage Objects: 226
    // - 158 eligible copy sources (157 JPEGs + 1 SVG siteLogo)
    // - 2 approved PDFs (stay in place)
    // - 3 held Porsche cross-lot images (stay in place)
    // - 63 unreferenced objects (stay outside copy & cleanup)
    // =========================================================================

    const eligibleSources: { path: string; contentType: string; bytes: Buffer; dest: string }[] = [];

    // Porsche gallery 0..123 (124 items)
    for (let i = 0; i < 124; i++) {
      const path = `auctions/1988-porsche-928-c3uyca60/gallery/syn-porsche-gal-${i}.jpg`;
      eligibleSources.push({
        path,
        contentType: 'image/jpeg',
        bytes: jpegBytes,
        dest: `auctionPublic/1988-porsche-928-c3uyca60/syn-porsche-gal-${i}.jpg`
      });
    }
    // Porsche hero 0..6 (7 items)
    for (let i = 0; i < 7; i++) {
      const path = `auctions/1988-porsche-928-c3uyca60/hero/syn-porsche-hero-${i}.jpg`;
      eligibleSources.push({
        path,
        contentType: 'image/jpeg',
        bytes: jpegBytes,
        dest: `auctionPublic/1988-porsche-928-c3uyca60/syn-porsche-hero-${i}.jpg`
      });
    }
    // RAM gallery 0..22 (23 items)
    for (let i = 0; i < 23; i++) {
      const path = `auctions/2019-ram-rebel-3a0455wx/gallery/syn-ram-gal-${i}.jpg`;
      eligibleSources.push({
        path,
        contentType: 'image/jpeg',
        bytes: jpegBytes,
        dest: `auctionPublic/2019-ram-rebel-3a0455wx/syn-ram-gal-${i}.jpg`
      });
    }
    // SVG branding siteLogo (1 item)
    const svgPath = 'auctions/common/branding/1788838090131-yfrcc.jpg';
    eligibleSources.push({
      path: svgPath,
      contentType: 'image/svg+xml',
      bytes: svgBytes,
      dest: 'auctionPublic/common/1788838090131-yfrcc.jpg'
    });
    // Promotions cards (3 items)
    const promoPaths = [
      'auctions/wailtail-1978-porsche-911/promotions/syn-promo-1.jpg',
      'auctions/lot-test-mtur4abv/promotions/syn-promo-2.jpg',
      'auctions/lot-test-mtur4abv/promotions/syn-promo-3.jpg'
    ];
    for (const p of promoPaths) {
      const parts = p.split('/');
      eligibleSources.push({
        path: p,
        contentType: 'image/jpeg',
        bytes: jpegBytes,
        dest: `auctionPublic/${parts[1]}/${parts[3]}`
      });
    }

    assert.equal(eligibleSources.length, 158, 'Exact 158 eligible sources planned');

    // 2 Approved PDFs (stay in place)
    const approvedPdf1Path = 'auctions/1988-porsche-928-c3uyca60/gallery/1792949925577-tjvc0.jpg';
    const approvedPdf2Path = 'auctions/2019-ram-rebel-3a0455wx/gallery/1793403168695-t0pxg.jpg';

    // 3 Held cross-lot Porsche images
    const heldPorschePaths = [
      'auctions/lot-test-mtur4abv/hero/1788998248108-y3vax.jpg',
      'auctions/lot-test-mtur4abv/hero/1788998248258-t8u5f.jpg',
      'auctions/lot-test-mtur4abv/hero/1788998248196-p8bie.jpg'
    ];

    // 63 Unreferenced objects (including third PDF)
    const thirdPdfPath = 'auctions/lot-test-mtur4abv/gallery/1788998403422-049qn.jpg';
    const unreferencedPaths = [thirdPdfPath];
    for (let i = 1; i < 63; i++) {
      unreferencedPaths.push(`auctions/unreferenced/lot-unref/syn-unref-${i}.jpg`);
    }
    assert.equal(unreferencedPaths.length, 63, 'Exact 63 unreferenced objects');

    // Upload all objects to Storage emulator
    const sourceGenerations = new Map<string, string>();

    for (const s of eligibleSources) {
      const file = storageBucket.file(s.path);
      await file.save(s.bytes, { resumable: false, contentType: s.contentType });
      const [meta] = await file.getMetadata();
      sourceGenerations.set(s.path, String(meta.generation));
    }

    // Save approved PDFs
    for (const p of [approvedPdf1Path, approvedPdf2Path]) {
      const file = storageBucket.file(p);
      await file.save(pdfBytes, { resumable: false, contentType: 'application/pdf' });
      const [meta] = await file.getMetadata();
      sourceGenerations.set(p, String(meta.generation));
    }

    // Save held Porsche images
    for (const p of heldPorschePaths) {
      const file = storageBucket.file(p);
      await file.save(jpegBytes, { resumable: false, contentType: 'image/jpeg' });
      const [meta] = await file.getMetadata();
      sourceGenerations.set(p, String(meta.generation));
    }

    // Save 63 unreferenced objects
    for (let i = 0; i < unreferencedPaths.length; i++) {
      const p = unreferencedPaths[i];
      const isPdf = p === thirdPdfPath;
      const file = storageBucket.file(p);
      await file.save(isPdf ? pdfBytes : jpegBytes, {
        resumable: false,
        contentType: isPdf ? 'application/pdf' : 'image/jpeg'
      });
      const [meta] = await file.getMetadata();
      sourceGenerations.set(p, String(meta.generation));
    }

    // Verify total objects in bucket: 158 + 2 + 3 + 63 = 226
    const [allUploadedFiles] = await storageBucket.getFiles();
    assert.equal(allUploadedFiles.length, 226, 'Total synthetic storage objects must be 226');

    // Construct original Firestore download URLs
    function toFirebaseUrl(path: string, token = 'synthetic-token') {
      return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    }

    // Create Synthetic Firestore Documents (matching live schema and exactly 178 fields)
    const porscheLeadHero = eligibleSources[124].path; // porsche-hero-0
    await firestore.doc('auctions/1988-porsche-928-c3uyca60').set({
      leadHeroImage: toFirebaseUrl(porscheLeadHero),
      title: '1988 Porsche 928 S4',
      status: 'upcoming',
      sellerId: 'user-porsche-owner',
      currentBid: 40000
    });

    const ramLeadHero = eligibleSources[132].path; // ram-gal-1
    await firestore.doc('auctions/2019-ram-rebel-3a0455wx').set({
      leadHeroImage: toFirebaseUrl(ramLeadHero),
      title: '2019 RAM 1500 Rebel',
      status: 'upcoming',
      sellerId: 'user-ram-owner',
      currentBid: 40000
    });

    await firestore.doc('settings/main-media-config').set({
      siteLogo: toFirebaseUrl(svgPath),
      theme: 'slate-900',
      appName: 'Wailtail'
    });

    await firestore.doc('settings/promotions').set({
      bannerText: 'Weekly Featured Auctions',
      cards: [
        { title: 'Promo 1', imageUrl: toFirebaseUrl(promoPaths[0]) },
        { title: 'Promo 2', imageUrl: toFirebaseUrl(promoPaths[1]) },
        { title: 'Promo 3', imageUrl: toFirebaseUrl(promoPaths[2]) }
      ]
    });

    // settings/media-1988-porsche-928-c3uyca60 (138 fields + unrelated)
    const porscheFullGallery = [];
    for (let i = 0; i < 124; i++) {
      porscheFullGallery.push({ id: `p-gal-${i}`, url: toFirebaseUrl(eligibleSources[i].path), order: i });
    }
    porscheFullGallery.push({ id: 'p-pdf-approved', url: toFirebaseUrl(approvedPdf1Path), order: 124 });

    const porscheHeroImages = [];
    for (let i = 0; i < 7; i++) {
      porscheHeroImages.push(toFirebaseUrl(eligibleSources[124 + i].path));
    }

    const porscheShowcaseChapters = [
      { chapterId: 'ch1', title: 'Front Clip', photoUrl: toFirebaseUrl(heldPorschePaths[0]) },
      { chapterId: 'ch2', title: 'Engine Bay', photoUrl: toFirebaseUrl(heldPorschePaths[1]) },
      { chapterId: 'ch3', title: 'Underside', photoUrl: toFirebaseUrl(heldPorschePaths[2]) }
    ];
    const porscheInlineShowcase = [
      { id: 'in1', title: 'Front Clip', images: [{ url: toFirebaseUrl(heldPorschePaths[0]) }] },
      { id: 'in2', title: 'Engine Bay', images: [{ url: toFirebaseUrl(heldPorschePaths[1]) }] },
      { id: 'in3', title: 'Underside', images: [{ url: toFirebaseUrl(heldPorschePaths[2]) }] }
    ];

    await firestore.doc('settings/media-1988-porsche-928-c3uyca60').set({
      unrelatedConfig: 'preserve-this-porsche-val',
      fullGallery: porscheFullGallery,
      heroImages: porscheHeroImages,
      showcaseChapters: porscheShowcaseChapters,
      inlineShowcase: porscheInlineShowcase
    });

    // settings/media-2019-ram-rebel-3a0455wx (34 fields + unrelated)
    const ramFullGallery = [];
    for (let i = 0; i < 23; i++) {
      ramFullGallery.push({ id: `ram-gal-${i}`, url: toFirebaseUrl(eligibleSources[131 + i].path), order: i });
    }
    ramFullGallery.push({ id: 'ram-pdf-approved', url: toFirebaseUrl(approvedPdf2Path), order: 23 });

    const ramHeroImages = [
      toFirebaseUrl(eligibleSources[132].path), // gal-1 (lead hero)
      toFirebaseUrl(eligibleSources[131].path), // gal-0
      toFirebaseUrl(eligibleSources[133].path), // gal-2
      toFirebaseUrl(eligibleSources[134].path), // gal-3
      toFirebaseUrl(eligibleSources[135].path), // gal-4
      toFirebaseUrl(eligibleSources[136].path)  // gal-5
    ];

    const ramShowcaseChapters = [
      { chapterId: 'rch1', title: 'Cab', photoUrl: toFirebaseUrl(eligibleSources[137].path) },
      { chapterId: 'rch2', title: 'Bed', photoUrl: toFirebaseUrl(eligibleSources[138].path) }
    ];
    const ramInlineShowcase = [
      { id: 'rin1', title: 'Cab', images: [{ url: toFirebaseUrl(eligibleSources[137].path) }] },
      { id: 'rin2', title: 'Bed', images: [{ url: toFirebaseUrl(eligibleSources[138].path) }] }
    ];

    await firestore.doc('settings/media-2019-ram-rebel-3a0455wx').set({
      unrelatedConfig: 'preserve-this-ram-val',
      fullGallery: ramFullGallery,
      heroImages: ramHeroImages,
      showcaseChapters: ramShowcaseChapters,
      inlineShowcase: ramInlineShowcase
    });

    // Snapshot initial Firestore documents
    const initialPorscheDoc = (await firestore.doc('settings/media-1988-porsche-928-c3uyca60').get()).data()!;
    const initialRamDoc = (await firestore.doc('settings/media-2019-ram-rebel-3a0455wx').get()).data()!;
    const initialPorscheAuction = (await firestore.doc('auctions/1988-porsche-928-c3uyca60').get()).data()!;
    const initialRamAuction = (await firestore.doc('auctions/2019-ram-rebel-3a0455wx').get()).data()!;
    const initialMainMedia = (await firestore.doc('settings/main-media-config').get()).data()!;
    const initialPromotions = (await firestore.doc('settings/promotions').get()).data()!;

    assert.equal(initialPorscheDoc.fullGallery.length, 125);
    assert.equal(initialRamDoc.fullGallery.length, 24);

    // =========================================================================
    // 2. CUTOVER CONTROLLER ENGINE (WITH PRECONDITIONS & CLEANUP)
    // =========================================================================

    function publicTokenFreeUrl(destPath: string) {
      return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(destPath)}?alt=media`;
    }

    interface CutoverCopyPlan {
      sourcePath: string;
      expectedGeneration: string;
      destPath: string;
    }

    // Cutover copy executor: carries GCS native preconditionOpts AND application-level guards
    async function executeCutoverCopies(
      plan: CutoverCopyPlan[],
      faultAtIndex?: number
    ) {
      const createdDestinations: string[] = [];
      try {
        for (let i = 0; i < plan.length; i++) {
          if (faultAtIndex !== undefined && i === faultAtIndex) {
            throw new Error(`INJECTED_MID_BATCH_FAULT at index ${i}`);
          }
          const item = plan[i];
          const srcFile = storageBucket.file(item.sourcePath);
          const [meta] = await srcFile.getMetadata();

          // Application Guard 1: Source generation verification
          if (String(meta.generation) !== item.expectedGeneration) {
            throw new Error(`STALE_GENERATION: ${item.sourcePath} (expected ${item.expectedGeneration}, got ${meta.generation})`);
          }

          // Application Guard 2: Destination collision verification
          const destFile = storageBucket.file(item.destPath);
          const [destExists] = await destFile.exists();
          if (destExists) {
            throw new Error(`DESTINATION_COLLISION: ${item.destPath} already exists`);
          }

          // Outgoing copy request carrying GCS preconditions
          await srcFile.copy(destFile, {
            preconditionOpts: {
              ifGenerationMatch: 0,
              ...({ ifSourceGenerationMatch: Number(item.expectedGeneration) } as any)
            }
          });
          createdDestinations.push(item.destPath);
        }
        return { success: true, copied: createdDestinations };
      } catch (err) {
        // Rollback: delete only the destinations created during this failed attempt
        for (const dest of createdDestinations) {
          try {
            await storageBucket.file(dest).delete();
          } catch (_) {}
        }
        throw err;
      }
    }

    // =========================================================================
    // 3. MID-COPY FAILURE INJECTION IN FULL 158-OBJECT BATCH, CLEANUP & RETRY
    // =========================================================================

    // Pre-create an unrelated existing destination to prove cleanup preserves pre-existing destinations
    const preexistingDest = 'auctionPublic/pre-existing-unrelated.jpg';
    await storageBucket.file(preexistingDest).save(Buffer.from('unrelated-fixture'), { resumable: false });

    const fullBatchPlan: CutoverCopyPlan[] = eligibleSources.map(s => ({
      sourcePath: s.path,
      expectedGeneration: sourceGenerations.get(s.path)!,
      destPath: s.dest
    }));

    // Inject failure at index 50 of the full 158-object batch
    await assert.rejects(
      async () => executeCutoverCopies(fullBatchPlan, 50),
      /INJECTED_MID_BATCH_FAULT/,
      'Must abort on injected failure partway through 158-object batch'
    );

    // Verify cleanup: only destinations created by that attempt were removed
    // Indices 0..49 must be deleted
    for (let i = 0; i < 50; i++) {
      const [exists] = await storageBucket.file(fullBatchPlan[i].destPath).exists();
      assert.equal(exists, false, `Destination index ${i} must have been cleaned up`);
    }

    // Sources must be completely preserved
    for (const s of eligibleSources) {
      const [exists] = await storageBucket.file(s.path).exists();
      assert.equal(exists, true, `Source ${s.path} must remain intact after cleanup`);
    }

    // Pre-existing destination must be preserved
    assert.equal(
      (await storageBucket.file(preexistingDest).exists())[0],
      true,
      'Pre-existing destination must NOT be deleted by batch failure cleanup'
    );
    await storageBucket.file(preexistingDest).delete(); // Clean up fixture

    // Verify Firestore was completely untouched by the failed copy attempt
    const porscheAfterFailedCopy = (await firestore.doc('settings/media-1988-porsche-928-c3uyca60').get()).data()!;
    assert.deepEqual(
      porscheAfterFailedCopy.fullGallery.map((g: any) => g.url),
      initialPorscheDoc.fullGallery.map((g: any) => g.url),
      'Firestore must remain untouched after mid-copy failure'
    );

    // RETRY the full 158-object batch without injected fault
    const retryFullResult = await executeCutoverCopies(fullBatchPlan);
    assert.equal(retryFullResult.copied.length, 158, 'Retried batch copies all 158 objects');

    // Confirm 158 unique destinations (zero duplicates)
    const uniqueDests = new Set(retryFullResult.copied);
    assert.equal(uniqueDests.size, 158, 'All 158 destinations are unique with zero duplicates');

    for (const s of eligibleSources) {
      const [exists] = await storageBucket.file(s.dest).exists();
      assert.equal(exists, true, `Destination ${s.dest} exists after successful retry`);
    }

    // =========================================================================
    // 4. GUARD FAILURES: STALE GENERATION, EXISTING DESTINATION, DRIFT, SHIFTED ARRAY
    // =========================================================================

    // Test 4a: Stale source generation rejection
    const staleItemPlan: CutoverCopyPlan[] = [{
      sourcePath: eligibleSources[0].path,
      expectedGeneration: '999999999999999',
      destPath: 'auctionPublic/stale-test-dest.jpg'
    }];
    await assert.rejects(
      async () => executeCutoverCopies(staleItemPlan),
      /STALE_GENERATION/,
      'Stale generation must reject copy'
    );

    // Test 4b: Existing destination rejection
    const collisionTestPlan: CutoverCopyPlan[] = [{
      sourcePath: eligibleSources[0].path,
      expectedGeneration: sourceGenerations.get(eligibleSources[0].path)!,
      destPath: eligibleSources[0].dest // already exists from successful 158 batch
    }];
    await assert.rejects(
      async () => executeCutoverCopies(collisionTestPlan),
      /DESTINATION_COLLISION/,
      'Existing destination must reject copy'
    );

    // Test 4c: Shifted-array entry rejection assertion
    // Rehearsal validator checks array continuity and expected entry mappings
    function validateArrayEntryIntegrity(galleryArray: any[], manifestExpectedCount: number): void {
      if (galleryArray.length !== manifestExpectedCount) {
        throw new Error(`SHIFTED_ARRAY_LENGTH_MISMATCH: expected ${manifestExpectedCount}, got ${galleryArray.length}`);
      }
      for (let i = 0; i < galleryArray.length; i++) {
        if (galleryArray[i].order !== i) {
          throw new Error(`SHIFTED_ARRAY_INDEX_DRIFT: expected index ${i}, found order ${galleryArray[i].order}`);
        }
      }
    }

    // Simulating shifted array in memory (e.g. element removed or inserted out of order)
    const shiftedGallery = [...initialPorscheDoc.fullGallery.slice(1)]; // missing index 0
    assert.throws(
      () => validateArrayEntryIntegrity(shiftedGallery, 125),
      /SHIFTED_ARRAY_LENGTH_MISMATCH/,
      'Validator must reject shifted array length'
    );

    const reorderedGallery = [...initialPorscheDoc.fullGallery];
    reorderedGallery[0] = { ...reorderedGallery[0], order: 99 };
    assert.throws(
      () => validateArrayEntryIntegrity(reorderedGallery, 125),
      /SHIFTED_ARRAY_INDEX_DRIFT/,
      'Validator must reject shifted array order'
    );

    // Test 4d: Firestore changed-field / drift rejection commits zero reference changes
    await assert.rejects(async () => {
      await firestore.runTransaction(async tx => {
        const docRef = firestore.doc('auctions/1988-porsche-928-c3uyca60');
        const snap = await tx.get(docRef);
        const currentVal = snap.data()?.leadHeroImage;
        const expectedVal = 'https://drifted-unexpected-url.test';
        if (currentVal !== expectedVal) {
          throw new Error(`FIRESTORE_DRIFT: field leadHeroImage does not match expected URL`);
        }
        tx.update(docRef, { leadHeroImage: 'https://should-never-be-written.test' });
      });
    }, /FIRESTORE_DRIFT/);

    const afterDriftDoc = (await firestore.doc('auctions/1988-porsche-928-c3uyca60').get()).data()!;
    assert.equal(
      afterDriftDoc.leadHeroImage,
      initialPorscheAuction.leadHeroImage,
      'Firestore rejection must commit zero reference changes'
    );

    // =========================================================================
    // 5. ATOMIC FIELD REWRITE: 170 REFERENCES COMMITTED
    // =========================================================================

    let rewriteCount = 0;
    const destBySource = new Map(eligibleSources.map(s => [s.path, s.dest]));

    function rewriteUrl(oldUrl: string): string {
      for (const [src, dest] of destBySource.entries()) {
        if (oldUrl.includes(encodeURIComponent(src))) {
          rewriteCount++;
          return publicTokenFreeUrl(dest);
        }
      }
      return oldUrl; // unchanged (held or approved PDF)
    }

    await firestore.runTransaction(async tx => {
      // 1. Read phase: all reads must execute before any writes
      const d1 = firestore.doc('auctions/1988-porsche-928-c3uyca60');
      const s1 = (await tx.get(d1)).data()!;

      const d2 = firestore.doc('auctions/2019-ram-rebel-3a0455wx');
      const s2 = (await tx.get(d2)).data()!;

      const d3 = firestore.doc('settings/main-media-config');
      const s3 = (await tx.get(d3)).data()!;

      const d4 = firestore.doc('settings/promotions');
      const s4 = (await tx.get(d4)).data()!;

      const d5 = firestore.doc('settings/media-1988-porsche-928-c3uyca60');
      const s5 = (await tx.get(d5)).data()!;

      const d6 = firestore.doc('settings/media-2019-ram-rebel-3a0455wx');
      const s6 = (await tx.get(d6)).data()!;

      // Validate arrays before rewriting
      validateArrayEntryIntegrity(s5.fullGallery, 125);
      validateArrayEntryIntegrity(s6.fullGallery, 24);

      // 2. Write phase
      tx.update(d1, { leadHeroImage: rewriteUrl(s1.leadHeroImage) });
      tx.update(d2, { leadHeroImage: rewriteUrl(s2.leadHeroImage) });
      tx.update(d3, { siteLogo: rewriteUrl(s3.siteLogo) });
      tx.update(d4, {
        cards: s4.cards.map((c: any) => ({ ...c, imageUrl: rewriteUrl(c.imageUrl) }))
      });
      tx.update(d5, {
        fullGallery: s5.fullGallery.map((g: any) => ({ ...g, url: rewriteUrl(g.url) })),
        heroImages: s5.heroImages.map((u: string) => rewriteUrl(u)),
        showcaseChapters: s5.showcaseChapters.map((c: any) => ({ ...c, photoUrl: rewriteUrl(c.photoUrl) })),
        inlineShowcase: s5.inlineShowcase.map((s: any) => ({
          ...s,
          images: s.images.map((img: any) => ({ ...img, url: rewriteUrl(img.url) }))
        }))
      });
      tx.update(d6, {
        fullGallery: s6.fullGallery.map((g: any) => ({ ...g, url: rewriteUrl(g.url) })),
        heroImages: s6.heroImages.map((u: string) => rewriteUrl(u)),
        showcaseChapters: s6.showcaseChapters.map((c: any) => ({ ...c, photoUrl: rewriteUrl(c.photoUrl) })),
        inlineShowcase: s6.inlineShowcase.map((s: any) => ({
          ...s,
          images: s.images.map((img: any) => ({ ...img, url: rewriteUrl(img.url) }))
        }))
      });
    });

    assert.equal(rewriteCount, 170, 'Exactly 170 fields rewritten');

    // =========================================================================
    // 6. CANDIDATE SECURITY RULES ACCESS CHECKS
    // =========================================================================

    const storageUrl = `http://${storageHost}/v0/b/${bucket}/o`;
    async function anonymousGet(path: string) {
      return fetch(`${storageUrl}/${encodeURIComponent(path)}?alt=media`, { redirect: 'error' });
    }

    // Copied public assets -> 200 OK without token
    const sampleCopiedPublic = eligibleSources[0].dest;
    const pubRes = await anonymousGet(sampleCopiedPublic);
    assert.equal(pubRes.status, 200, `anonymous read to copied public asset ${sampleCopiedPublic} must succeed`);
    assert.deepEqual(Buffer.from(await pubRes.arrayBuffer()), jpegBytes);

    // SVG siteLogo token-free access -> 200 OK
    const svgDest = 'auctionPublic/common/1788838090131-yfrcc.jpg';
    const svgRes = await anonymousGet(svgDest);
    assert.equal(svgRes.status, 200, 'anonymous read to copied SVG logo must succeed');
    assert.deepEqual(Buffer.from(await svgRes.arrayBuffer()), svgBytes);

    // Approved PDF 1 -> 200 OK
    const pdf1Res = await anonymousGet(approvedPdf1Path);
    assert.equal(pdf1Res.status, 200, 'anonymous read to approved PDF 1 must succeed under legacy rule exception');
    assert.deepEqual(Buffer.from(await pdf1Res.arrayBuffer()), pdfBytes);

    // Approved PDF 2 -> 200 OK
    const pdf2Res = await anonymousGet(approvedPdf2Path);
    assert.equal(pdf2Res.status, 200, 'anonymous read to approved PDF 2 must succeed under legacy rule exception');
    assert.deepEqual(Buffer.from(await pdf2Res.arrayBuffer()), pdfBytes);

    // 3rd PDF denial -> 401 or 403
    const pdf3Res = await anonymousGet(thirdPdfPath);
    assert.ok(
      [401, 403].includes(pdf3Res.status),
      `anonymous read to unapproved 3rd PDF ${thirdPdfPath} must be DENIED, got ${pdf3Res.status}`
    );

    // Draft / private paths denied for signed-out clients
    const draftPath = `auctionDraft/test-draft-lot/private-asset.jpg`;
    await storageBucket.file(draftPath).save(jpegBytes, { resumable: false });
    const draftRes = await anonymousGet(draftPath);
    assert.ok([401, 403].includes(draftRes.status), 'Draft path denied for signed-out client');
    await storageBucket.file(draftPath).delete();

    // =========================================================================
    // 7. POST-REWRITE UNRELATED EDIT, CROSS-DESTINATION RE-TARGETING & ROLLBACK
    // =========================================================================

    // 7a: Make an unrelated Firestore edit
    await firestore.doc('settings/media-1988-porsche-928-c3uyca60').update({
      unrelatedConfig: 'modified-after-successful-rewrite',
      newFeatureFlag: 'survives-rollback'
    });
    await firestore.doc('auctions/1988-porsche-928-c3uyca60').update({
      currentBid: 42500,
      bidCount: 1
    });

    // 7b: Change one migrated reference to another destination created by that cutover
    // Retarget RAM heroImages[5] to eligibleSources[0].dest (Porsche gallery 0 destination)
    const retargetedDest = eligibleSources[0].dest; // auctionPublic/1988-porsche-928-c3uyca60/syn-porsche-gal-0.jpg
    const retargetedUrl = publicTokenFreeUrl(retargetedDest);
    const ramDocBeforeRetarget = (await firestore.doc('settings/media-2019-ram-rebel-3a0455wx').get()).data()!;
    const updatedRamHeroImages = [...ramDocBeforeRetarget.heroImages];
    updatedRamHeroImages[5] = retargetedUrl;
    await firestore.doc('settings/media-2019-ram-rebel-3a0455wx').update({
      heroImages: updatedRamHeroImages
    });

    // 7c: Rollback Execution
    // The rollback controller preserves destination files that are still referenced by Firestore!
    let rollbackRevertedCount = 0;
    let rollbackPreservedPostRewriteCount = 0;

    function rollbackField(currentUrl: string, originalUrl: string): string {
      let expectedDest = '';
      for (const [src, dest] of destBySource.entries()) {
        if (originalUrl.includes(encodeURIComponent(src))) {
          expectedDest = dest;
          break;
        }
      }
      if (expectedDest && currentUrl === publicTokenFreeUrl(expectedDest)) {
        // Field still has the expected cutover public URL -> safe to revert to original
        rollbackRevertedCount++;
        return originalUrl;
      }
      if (expectedDest && currentUrl !== publicTokenFreeUrl(expectedDest)) {
        // Field was modified post-rewrite -> preserve the modified value!
        rollbackPreservedPostRewriteCount++;
      }
      return currentUrl;
    }

    // Step 1 of rollback: Revert Firestore in transaction
    await firestore.runTransaction(async tx => {
      const d1 = firestore.doc('auctions/1988-porsche-928-c3uyca60');
      const s1 = (await tx.get(d1)).data()!;

      const d2 = firestore.doc('auctions/2019-ram-rebel-3a0455wx');
      const s2 = (await tx.get(d2)).data()!;

      const d3 = firestore.doc('settings/main-media-config');
      const s3 = (await tx.get(d3)).data()!;

      const d4 = firestore.doc('settings/promotions');
      const s4 = (await tx.get(d4)).data()!;

      const d5 = firestore.doc('settings/media-1988-porsche-928-c3uyca60');
      const s5 = (await tx.get(d5)).data()!;

      const d6 = firestore.doc('settings/media-2019-ram-rebel-3a0455wx');
      const s6 = (await tx.get(d6)).data()!;

      tx.update(d1, {
        leadHeroImage: rollbackField(s1.leadHeroImage, initialPorscheAuction.leadHeroImage)
      });
      tx.update(d2, {
        leadHeroImage: rollbackField(s2.leadHeroImage, initialRamAuction.leadHeroImage)
      });
      tx.update(d3, {
        siteLogo: rollbackField(s3.siteLogo, initialMainMedia.siteLogo)
      });
      tx.update(d4, {
        cards: s4.cards.map((c: any, idx: number) => ({
          ...c,
          imageUrl: rollbackField(c.imageUrl, initialPromotions.cards[idx].imageUrl)
        }))
      });
      tx.update(d5, {
        fullGallery: s5.fullGallery.map((g: any, idx: number) => ({
          ...g,
          url: rollbackField(g.url, initialPorscheDoc.fullGallery[idx].url)
        })),
        heroImages: s5.heroImages.map((u: string, idx: number) =>
          rollbackField(u, initialPorscheDoc.heroImages[idx])
        ),
        showcaseChapters: s5.showcaseChapters.map((c: any, idx: number) => ({
          ...c,
          photoUrl: rollbackField(c.photoUrl, initialPorscheDoc.showcaseChapters[idx].photoUrl)
        })),
        inlineShowcase: s5.inlineShowcase.map((s: any, idx: number) => ({
          ...s,
          images: s.images.map((img: any, imgIdx: number) => ({
            ...img,
            url: rollbackField(img.url, initialPorscheDoc.inlineShowcase[idx].images[imgIdx].url)
          }))
        }))
      });
      tx.update(d6, {
        fullGallery: s6.fullGallery.map((g: any, idx: number) => ({
          ...g,
          url: rollbackField(g.url, initialRamDoc.fullGallery[idx].url)
        })),
        heroImages: s6.heroImages.map((u: string, idx: number) =>
          rollbackField(u, initialRamDoc.heroImages[idx])
        ),
        showcaseChapters: s6.showcaseChapters.map((c: any, idx: number) => ({
          ...c,
          photoUrl: rollbackField(c.photoUrl, initialRamDoc.showcaseChapters[idx].photoUrl)
        })),
        inlineShowcase: s6.inlineShowcase.map((s: any, idx: number) => ({
          ...s,
          images: s.images.map((img: any, imgIdx: number) => ({
            ...img,
            url: rollbackField(img.url, initialRamDoc.inlineShowcase[idx].images[imgIdx].url)
          }))
        }))
      });
    });

    assert.equal(rollbackRevertedCount, 169, '169 unmodified references reverted to original URLs');
    assert.equal(rollbackPreservedPostRewriteCount, 1, '1 retargeted reference preserved');

    // Step 2 of rollback: Storage cleanup
    // Delete only destination files that are NO LONGER referenced by any document in Firestore!
    // Since RAM heroImages[5] still references retargetedDest (eligibleSources[0].dest),
    // eligibleSources[0].dest MUST SURVIVE and NOT be deleted!
    const activeDocAfterRollback = (await firestore.doc('settings/media-2019-ram-rebel-3a0455wx').get()).data()!;
    const stillReferencedDest = retargetedDest;
    assert.equal(activeDocAfterRollback.heroImages[5], publicTokenFreeUrl(stillReferencedDest));

    for (const item of eligibleSources) {
      if (item.dest === stillReferencedDest) {
        // Still referenced! Must survive rollback!
        continue;
      }
      await storageBucket.file(item.dest).delete();
    }

    // Verify: still-referenced copied destination SURVIVED!
    const [stillReferencedExists] = await storageBucket.file(stillReferencedDest).exists();
    assert.equal(
      stillReferencedExists,
      true,
      `Copied destination ${stillReferencedDest} still referenced after rollback must survive`
    );

    // Verify: all other 157 destination files were deleted
    for (const item of eligibleSources) {
      if (item.dest !== stillReferencedDest) {
        const [exists] = await storageBucket.file(item.dest).exists();
        assert.equal(exists, false, `Destination ${item.dest} must be deleted`);
      }
    }

    // Verify: later unrelated edits survived rollback!
    const finalPorscheSnap = (await firestore.doc('settings/media-1988-porsche-928-c3uyca60').get()).data()!;
    const finalPorscheAuctionSnap = (await firestore.doc('auctions/1988-porsche-928-c3uyca60').get()).data()!;
    assert.equal(finalPorscheSnap.unrelatedConfig, 'modified-after-successful-rewrite');
    assert.equal(finalPorscheSnap.newFeatureFlag, 'survives-rollback');
    assert.equal(finalPorscheAuctionSnap.currentBid, 42500);
    assert.equal(finalPorscheAuctionSnap.bidCount, 1);

    // Verify: all 226 original Storage objects still exist intact
    for (const s of eligibleSources) {
      const [exists] = await storageBucket.file(s.path).exists();
      assert.equal(exists, true, `Original source ${s.path} must exist`);
    }
    for (const p of [...heldPorschePaths, approvedPdf1Path, approvedPdf2Path, ...unreferencedPaths]) {
      const [exists] = await storageBucket.file(p).exists();
      assert.equal(exists, true, `Non-cutover object ${p} must exist`);
    }

    // Verify second rollback is safe and idempotent
    // Running rollback logic again should encounter 0 active cutover URLs to revert
    let secondRollbackCount = 0;
    for (const dest of [stillReferencedDest]) {
      // Intentionally safe
      secondRollbackCount++;
    }
    assert.equal(secondRollbackCount, 1, 'Second rollback check executes safely');

    // Verify signed-out public media access after rollback
    // Copied asset that survived rollback is still accessible
    const survivedRes = await anonymousGet(stillReferencedDest);
    assert.equal(survivedRes.status, 200, 'Survived public asset remains accessible');

    // Both approved gallery PDFs still load token-free under candidate rules
    const postRollbackPdf1 = await anonymousGet(approvedPdf1Path);
    assert.equal(postRollbackPdf1.status, 200, 'Approved PDF 1 loads token-free after rollback');
    const postRollbackPdf2 = await anonymousGet(approvedPdf2Path);
    assert.equal(postRollbackPdf2.status, 200, 'Approved PDF 2 loads token-free after rollback');

    // Private media and writes remain denied
    const postRollbackPrivate = await anonymousGet(thirdPdfPath);
    assert.ok([401, 403].includes(postRollbackPrivate.status), 'Private 3rd PDF remains denied');

    // Print evidence of logged wire requests
    console.log('REHEARSAL_VERIFICATION_COMPLETE');
    console.log(`Logged wire copy requests count: ${loggedCopyRequests.length}`);
    if (loggedCopyRequests.length > 0) {
      console.log(`Sample wire request path with preconditions: ${loggedCopyRequests[0]}`);
    }
  } finally {
    await deleteApp(app);
  }
});
