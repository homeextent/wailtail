import auctionClock from '../api/auction-clock';
import retractAuctionBid from '../api/admin-retract-auction-bid';
import settleAuction from '../api/admin-settle-auction';
import uploadAuctionImage from '../api/admin-upload-auction-image';
import saveAuctionMedia from '../api/admin-save-auction-media';
import deleteAuction from '../api/admin-delete-auction';
import updateAuction from '../api/admin-update-auction';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { initializeApp } from 'firebase-admin/app';
import { getFirebaseAdminServices } from '../api/_lib/firebaseAdmin';
import returnToDraft from '../api/admin-return-auction-to-draft';
import list from '../api/seller-draft-list';
import read from '../api/seller-draft-read';
import save from '../api/seller-draft-narrative';
import submit from '../api/seller-draft-submit';
import upload from '../api/seller-draft-upload';
import media from '../api/seller-draft-media';
import publicAuctions from '../api/public-auctions';
import placeBid from '../api/place-auction-bid';
import auctionComments from '../api/auction-comments';
import createAuction from '../api/admin-create-auction';

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

const server = express();
server.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http://127.0.0.1:9199; connect-src 'self' http://127.0.0.1:9099 http://127.0.0.1:8080 http://127.0.0.1:9199");
  next();
});
server.use(express.json({ limit: '3mb' }));
server.get('/api/public-auctions', (req, res, next) => {
  Promise.resolve(publicAuctions(req, res)).catch(next);
});
server.post('/api/admin-delete-auction', (req, res, next) => {
  Promise.resolve(deleteAuction(req, res)).catch(next);
});
server.post('/api/admin-upload-auction-image', (req, res, next) => {
  Promise.resolve(uploadAuctionImage(req, res)).catch(next);
});
server.post('/api/admin-save-auction-media', (req, res, next) => {
  Promise.resolve(saveAuctionMedia(req, res)).catch(next);
});
server.post('/api/admin-retract-auction-bid', (req, res, next) => {
  Promise.resolve(retractAuctionBid(req, res)).catch(next);
});
server.post('/api/auction-clock', (req, res, next) => {
  Promise.resolve(auctionClock(req, res)).catch(next);
});
server.post('/api/admin-settle-auction', (req, res, next) => {
  Promise.resolve(settleAuction(req, res)).catch(next);
});
server.post('/api/admin-update-auction', (req, res, next) => {
  Promise.resolve(updateAuction(req, res)).catch(next);
});
server.post('/api/admin-create-auction', (req, res, next) => {
  Promise.resolve(createAuction(req, res)).catch(next);
});
server.post('/api/auction-comments', (req, res, next) => {
  Promise.resolve(auctionComments(req, res)).catch(next);
});
server.post('/api/place-auction-bid', (req, res, next) => {
  Promise.resolve(placeBid(req, res)).catch(next);
});
server.get('/fixture', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ projectId, authHost: bindings.FIREBASE_AUTH_EMULATOR_HOST, email, password, auctionId, publicAuctionId });
});
for (const [operation, handler] of Object.entries({ list, read, narrative: save, submit, upload, media })) {
  server.post(`/api/seller-draft-${operation}`, (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  });
}
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
server.post('/api/admin-return-auction-to-draft', (req, res, next) => {
  Promise.resolve(returnToDraft(req, res)).catch(next);
});
// Serve the real app at its real routes, with Firebase modules replaced only in this harness.
server.get(['/','/catalog','/auctions/:auctionId','/admin','/dashboard/listings/:auctionId/edit'], (_req, res) => {
  res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Isolated Wailtail app</title><div id="root"></div><script type="module" src="/tests/full-app-browser.tsx"></script></html>');
});
const firebaseModules = ['src/firebase', 'src/services/firebase'].map(path => resolve(path));
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'mpa',
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
  console.log('Signed-out catalog: http://127.0.0.1:4178/catalog?actor=public');
  console.log('Public catalog API: http://127.0.0.1:4178/api/public-auctions');
  console.log('Actual seller route: http://127.0.0.1:4178/?fixture=draft');
  console.log('Actual admin portal: http://127.0.0.1:4178/admin?tab=inventory');
  console.log('Component-only fixture: http://127.0.0.1:4178/tests/seller-browser.html');
});
