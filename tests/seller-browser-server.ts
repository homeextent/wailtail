import apiRouter from '../api/router';
import { getFirebaseAdminServices } from '../server/api/_lib/firebaseAdmin';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import express from 'express';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { initializeApp } from 'firebase-admin/app';

const projectId = 'demo-wailtail-stage3';
const bucket = `${projectId}.appspot.com`;
const bindings = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199'
};
for (const [key, value] of Object.entries(bindings)) assert.equal(process.env[key], value, key);
assert.equal(process.env.GCLOUD_PROJECT, projectId);
for (const key of ['GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID']) {
  assert.ok(!process.env[key] || process.env[key] === projectId, `Conflicting project: ${key}`);
}
for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_KEY',
  'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL']) assert.ok(!process.env[key], `Unset ${key}`);
const storageHost = `http://${bindings.FIREBASE_STORAGE_EMULATOR_HOST}`;
assert.ok(!process.env.STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST === storageHost);
assert.ok(!process.env.FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET === bucket);
process.env.STORAGE_EMULATOR_HOST = storageHost;
process.env.FIREBASE_STORAGE_BUCKET = bucket;

await Promise.all(Object.values(bindings).map(host =>
  fetch(`http://${host}/`, { redirect: 'error', signal: AbortSignal.timeout(3000) })
));

initializeApp({ projectId, storageBucket: bucket });
const { auth, firestore } = getFirebaseAdminServices();
const run = randomUUID();
const email = `browser-${run}@example.test`;
const password = `Synthetic-${run}`;
const auctionId = `browser-${run}`;
const { uid } = await auth.createUser({ email, password, emailVerified: true });
await firestore.collection('users').doc(uid).set({ uid, email, displayName: 'Synthetic Seller', role: 'seller', isEmailVerified: true, welcomeEmailSent: true });
await firestore.collection('auctions').doc(auctionId).set({
  sellerId: uid, status: 'draft', title: 'Synthetic browser listing', make: 'Test', model: 'Fixture', year: 2000
});

// Oversized fixture exercises the real administrator error toast without deletion.
const oversizedBatch = firestore.batch();
for (let index = 0; index < 401; index++) {
  oversizedBatch.set(firestore.collection('auctions').doc(auctionId).collection('bids').doc(String(index)), { amount: 1000 });
}
await oversizedBatch.commit();

await firestore.collection('settings').doc(`media-${auctionId}`).set({
  showcaseChapters: [{ id: 'overview-fixture', title: 'Exterior Highlights', category: 'EXTERIOR',
    subtitle: 'Original subtitle', narrative: 'Original chapter narrative', specCards: [] },
  { id: 'custom-fixture', title: 'Custom Details', category: 'CUSTOM', subtitle: '', narrative: '', highlights: [] }]
});

await firestore.collection('auctions').doc(`foreign-${run}`).set({
  sellerId: 'unrelated-synthetic-owner', status: 'draft', title: 'Unrelated synthetic draft'
});

const adminEmail = 'jeremygoodmurphy@gmail.com';
const adminPassword = `Synthetic-admin-${run}`;
const { uid: adminUid } = await auth.createUser({ email: adminEmail, password: adminPassword, emailVerified: true });
await firestore.collection('users').doc(adminUid).set({
  uid: adminUid, email: adminEmail, displayName: 'Synthetic Administrator',
  role: 'admin', isEmailVerified: true, welcomeEmailSent: true
});

const publicAuctionId = `public-${run}`;
await firestore.collection('auctions').doc(publicAuctionId).set({
  status: 'active', title: 'Synthetic public auction', startTime: Date.now() - 60_000,
  endTime: Date.now() + 3_600_000, startingBid: 1000, currentBid: 0,
  minimumIncrement: 250, reserveAmount: 5000, sellerEmail: 'private-fixture@example.test'
});

await firestore.collection('settings').doc(`media-${publicAuctionId}`).set({
  heroImages: [],
  overviewHeading: 'Synthetic public overview',
  overviewParagraphs: ['Synthetic public description'],
  fullGallery: [], inlineShowcase: [], showcaseChapters: [],
  youtubePlaylistUrl: ''
});

await firestore.collection('settings').doc('global').set({ siteName: 'Synthetic Wailtail Brand', siteTagline: 'Synthetic tagline', privateAdminField: 'private' });

await firestore.collection('consignment_applications').doc(`submission-${run}`).set({
  sellerEmail: email, sellerName: 'Synthetic Seller', status: 'pending', year: 2000,
  make: 'Synthetic', model: 'Submission', transmission: '5-Speed Manual', notes: 'Applicant condition disclosure', submittedAt: Date.now()
});

const dealerRepresentative = await auth.createUser({ email: `dealer-rep-${run}@example.test`, emailVerified: true });
await firestore.collection('users').doc(dealerRepresentative.uid).set({ uid: dealerRepresentative.uid, email: dealerRepresentative.email, role: 'bidder' });

const server = express();
server.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http://127.0.0.1:9199; connect-src 'self' http://127.0.0.1:9099 http://127.0.0.1:8080 http://127.0.0.1:9199");
  next();
});
server.use(express.json({ limit: '3mb' }));
server.all('/api/:endpoint', (req, res, next) => {
  // No real mail delivery from any synthetic intake fixture.
  if (req.params.endpoint === 'send-consignment-email') return res.status(202).json({ success: true, synthetic: true });
  req.query = { ...req.query, __endpoint: req.params.endpoint };
  Promise.resolve(apiRouter(req, res)).catch(next);
});
server.get('/acceptance-fixture', async (_req, res, next) => {
  try {
    const [media, lot, inquiries, global, consignment] = await Promise.all([
      firestore.collection('settings').doc(`media-${auctionId}`).get(),
      firestore.collection('auctions').doc(publicAuctionId).get(),
      firestore.collection('inquiries').where('auctionId', '==', publicAuctionId).get(),
      firestore.collection('settings').doc('global').get(),
      firestore.collection('consignment_applications').doc(`submission-${run}`).get()
    ]);
    res.json({ heading: media.get('overviewHeading') || '', watchCount: lot.get('watchCount') || 0,
      inquiries: inquiries.size, siteName: global.get('siteName'), consignmentStatus: consignment.get('status') });
  } catch (error) { next(error); }
});
server.get('/intake-fixture', async (_req, res, next) => {
  try {
    const records = await firestore.collection('consignment_applications').where('sellerEmail', '==', 'intake-browser@example.test').get();
    res.json(records.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (error) { next(error); }
});
server.get('/dealer-verification-fixture/:id', async (req, res, next) => {
  try {
    const caseId = createHash('sha256').update(`consignment_applications:${req.params.id}`).digest('hex');
    const review = (await firestore.collection('dealerVerificationCases').doc(caseId).get()).data();
    const profile = review?.dealerId ? (await firestore.collection('dealer_profiles').doc(review.dealerId).get()).data() : null;
    const user = (await firestore.collection('users').doc(dealerRepresentative.uid).get()).data();
    const bidder = (await firestore.collection('bidders').doc(dealerRepresentative.uid).get()).data();
    const application = (await firestore.collection('consignment_applications').doc(req.params.id).get()).data();
    const events = await firestore.collection('dealer_verification_audits').where('caseId', '==', caseId).get();
    res.json({ review, profile, user, bidder, application, events: events.size });
  } catch (error) { next(error); }
});
server.get('/fixture', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ projectId, authHost: bindings.FIREBASE_AUTH_EMULATOR_HOST, email, password, auctionId, publicAuctionId, dealerRepresentativeUid: dealerRepresentative.uid });
});
server.get('/admin-fixture', async (_req, res, next) => {
  try {
    const listing = await firestore.collection('auctions').doc(auctionId).get();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ projectId, authHost: bindings.FIREBASE_AUTH_EMULATOR_HOST,
      email: adminEmail, password: adminPassword, auctionId,
      status: listing.get('status'), revision: listing.get('sellerDraftRevision') ?? 0 });
  } catch (err) {
    next(err);
  }
});
// Serve the real app at its real routes, with Firebase modules replaced only in this harness.
server.get(['/intake','/','/catalog','/auctions/:auctionId','/admin','/dashboard/listings/:auctionId/edit'], (req, res) => {
  const entry = req.path === '/intake' ? '/tests/intake-browser.tsx' : '/tests/full-app-browser.tsx';
  res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Isolated Wailtail app</title><div id="root"></div><script type="module" src="' + entry + '"></script></html>');
});
const firebaseModules = ['src/firebase', 'src/services/firebase'].map(path => resolve(path));
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'mpa',
  // Resolve both JSX entry points before the first page; mid-run optimization reloads
  // would interrupt the harness's deliberately in-memory authentication.
  optimizeDeps: { include: ['react/jsx-runtime', 'react/jsx-dev-runtime'] },
  plugins: [tailwindcss(), {
    name: 'isolated-firebase-fixture',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.startsWith('.') || !importer) return;
      const target = resolve(importer, '..', source).replace(/\.tsx?$/, '');
      if (firebaseModules.includes(target)) return resolve('tests/full-app-firebase.ts');
    }
  }]
});
server.use(vite.middlewares);
server.listen(4178, '127.0.0.1', () => {
  console.log('Dealer/private intake: http://127.0.0.1:4178/intake');
  console.log('Signed-out catalog: http://127.0.0.1:4178/catalog?actor=public');
  console.log('Public catalog API: http://127.0.0.1:4178/api/public-auctions');
  console.log('Actual seller route: http://127.0.0.1:4178/?fixture=draft');
  console.log('Actual admin portal: http://127.0.0.1:4178/admin?tab=inventory');
  console.log('Component-only fixture: http://127.0.0.1:4178/tests/seller-browser.html');
});
