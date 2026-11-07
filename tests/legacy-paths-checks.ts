import resetBids from '../server/api/admin-reset-auction-bids';
import createAuction from '../server/api/admin-create-auction';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import memberActions from '../server/api/auction-member-actions';
import publicSettings from '../server/api/public-settings';
import saveDraft from '../server/api/seller-draft-narrative';
import readDraft from '../server/api/seller-draft-read';
import saveMedia from '../server/api/admin-save-auction-media';
import uploadImage from '../server/api/admin-upload-auction-image';
import legacyEmail from '../server/api/send-consignment-email';

export async function checkLegacyPaths({ firestore, owner, other, admin, run, invoke, storageHost }: any) {
  const lotId = `legacy-${run}`;
  const lot = firestore.collection('auctions').doc(lotId);
  const profile = firestore.collection('users').doc(owner.uid);
  await profile.set({ uid: owner.uid, role: 'seller', watchlist: [] });
  await firestore.collection('users').doc(other.uid).set({ uid: other.uid, role: 'bidder', watchlist: [] });
  await lot.set({ title: 'Synthetic legacy acceptance', status: 'preview', sellerId: owner.uid,
    sellerEmail: 'canonical-seller@example.test', watchCount: 0 });
  const watch = { action: 'watch', auctionId: lotId, watching: true };
  assert.equal((await invoke(memberActions, watch)).status, 401);
  const saves = await Promise.all([invoke(memberActions, watch, owner.idToken), invoke(memberActions, watch, owner.idToken)]);
  assert.ok(saves.every(result => result.status === 200));
  assert.equal((await lot.get()).get('watchCount'), 1, 'Concurrent retries must not inflate counts');
  assert.deepEqual((await profile.get()).get('watchlist'), [lotId]);
  assert.deepEqual((await firestore.collection('users').doc(other.uid).get()).get('watchlist'), []);
  assert.equal((await invoke(memberActions, { ...watch, watching: false }, owner.idToken)).status, 200);
  assert.equal((await lot.get()).get('watchCount'), 0);
  await profile.update({ watchlist: Array.from({ length: 500 }, (_, index) => `saved-${index}`) });
  assert.equal((await invoke(memberActions, watch, owner.idToken)).status, 422);
  await profile.update({ watchlist: [] });
  await lot.update({ status: 'draft' });
  assert.equal((await invoke(memberActions, watch, owner.idToken)).status, 404);
  assert.deepEqual((await profile.get()).get('watchlist'), []);
  await lot.update({ status: 'preview' });

  const failureId = randomUUID();
  const originalTransaction = firestore.runTransaction.bind(firestore);
  try {
    firestore.runTransaction = async () => { throw new Error('Synthetic transaction rejection'); };
    assert.equal((await invoke(memberActions, { action: 'inquiry', auctionId: lotId, topic: 'Failure', message: 'No writes', requestId: failureId }, owner.idToken)).status, 503);
  } finally { firestore.runTransaction = originalTransaction; }
  assert.equal((await firestore.collection('inquiries').doc(`${owner.uid}_${failureId}`).get()).exists, false);
  assert.equal((await firestore.collection('auctionNotificationOutbox').doc(`inquiry_${owner.uid}_${failureId}`).get()).exists, false);

  const inquiry = { action: 'inquiry', auctionId: lotId, topic: 'Viewing', message: 'Synthetic inquiry',
    senderId: other.uid, senderEmail: other.email, sellerEmail: 'attacker@example.test', requestId: randomUUID() };
  assert.equal((await invoke(memberActions, inquiry)).status, 401);
  assert.equal((await invoke(memberActions, inquiry, owner.idToken)).status, 201);
  const id = `${owner.uid}_${inquiry.requestId}`;
  const saved = (await firestore.collection('inquiries').doc(id).get()).data();
  assert.equal(saved.senderId, owner.uid);
  assert.equal(saved.senderEmail, owner.email);
  const notice = firestore.collection('auctionNotificationOutbox').doc(`inquiry_${id}`);
  assert.deepEqual((await notice.get()).get('to'), ['canonical-seller@example.test']);
  assert.equal((await invoke(memberActions, inquiry, owner.idToken)).status, 200);
  assert.equal((await firestore.collection('inquiries').where('senderId', '==', owner.uid).get()).size, 1);
  assert.equal((await invoke(memberActions, { ...inquiry, requestId: randomUUID() }, owner.idToken)).status, 429);
  await profile.update({ isBanned: true });
  assert.equal((await invoke(memberActions, watch, owner.idToken)).status, 403);
  assert.equal((await invoke(memberActions, inquiry, owner.idToken)).status, 403);
  await profile.update({ isBanned: false });
  // Do not leave an inquiry queued for the later mocked dispatcher scenario.
  await notice.update({ status: 'accepted' });
  for (const type of ['inquiry', 'outbid_notification', 'winning_bid_confirmation']) {
    assert.equal((await invoke(legacyEmail, { type })).status, 410);
  }
  for (const type of ['consignment_approved', 'consignment_rejected', 'listing_approved']) {
    assert.equal((await invoke(legacyEmail, { type })).status, 401);
    assert.equal((await invoke(legacyEmail, { type }, other.idToken)).status, 403);
  }

  const activityId = `activity-${run}`;
  const winnerId = `winner-${run}`;
  await firestore.collection('auctions').doc(activityId).set({ status: 'active', title: 'Own activity', endTime: Date.now() + 60000,
    currentBid: 1750, highBidderId: other.uid, sellerEmail: 'private@example.test' });
  await firestore.collection('bids').doc(`own-${run}`).set({ auctionId: activityId, bidderId: owner.uid, amount: 1500 });
  await firestore.collection('bids').doc(`foreign-${run}`).set({ auctionId: activityId, bidderId: other.uid, amount: 1750 });
  await firestore.collection('auctions').doc(winnerId).set({ status: 'sold', title: 'Own win', highBidderId: owner.uid,
    currentBid: 2000, sellerEmail: 'winner-contact@example.test' });
  await firestore.collection('consignment_applications').doc(`own-${run}`).set({ sellerEmail: owner.email, make: 'Own submission', status: 'pending' });
  await firestore.collection('consignment_applications').doc(`foreign-${run}`).set({ sellerEmail: other.email, make: 'Foreign submission', status: 'pending' });
  const activity = await invoke(memberActions, { action: 'activity', userId: other.uid, userEmail: other.email }, owner.idToken);
  assert.equal(activity.status, 200);
  const active = activity.payload.activeBids.find((bid: any) => bid.auctionId === activityId);
  assert.equal(active.userHighestBid, 1500);
  assert.equal(active.status, 'OUTBID');
  assert.equal(active.sellerEmail, undefined);
  assert.equal(activity.payload.wonAuctions.find((win: any) => win.auctionId === winnerId).sellerEmail, 'winner-contact@example.test');
  assert.ok(activity.payload.consignments.some((app: any) => app.make === 'Own submission'));
  assert.ok(!activity.payload.consignments.some((app: any) => app.make === 'Foreign submission'));
  const foreignActivity = await invoke(memberActions, { action: 'activity' }, other.idToken);
  assert.ok(!foreignActivity.payload.wonAuctions.some((win: any) => win.auctionId === winnerId));

  await firestore.collection('settings').doc('global').delete();
  await firestore.collection('settings').doc('main-media-config').set({ siteLogo: 'https://example.test/legacy-logo.jpg', privateLegacyField: 'private' });
  const fallbackBranding = await invoke(publicSettings, {}, undefined, 'GET');
  assert.deepEqual(fallbackBranding.payload, { branding: { siteLogo: 'https://example.test/legacy-logo.jpg' } });
  await firestore.collection('settings').doc('global').set({ siteName: 'Synthetic Wailtail', siteTagline: 'Test',
    siteLogo: '', privateAdminEmail: 'private@example.test', defaultStartingBid: 1234 });
  const branding = await invoke(publicSettings, {}, undefined, 'GET');
  assert.equal(branding.status, 200);
  assert.deepEqual(branding.payload, { branding: { siteName: 'Synthetic Wailtail', siteTagline: 'Test', siteLogo: '' } });
  const created = await invoke(createAuction, { title: 'Default finance fixture' }, admin.idToken);
  assert.equal(created.status, 201);
  assert.equal(created.payload.auction.startingBid, 1234);
  assert.equal(created.payload.auction.minimumIncrement, 250);
  assert.equal(created.payload.auction.currentBid, 0);
  await firestore.collection('auctions').doc(created.payload.auction.id).update({ isReserveMet: false });
  assert.equal((await invoke(resetBids, { auctionId: created.payload.auction.id }, admin.idToken)).status, 200);
  assert.equal((await firestore.collection('auctions').doc(created.payload.auction.id).get()).get('isReserveMet'), true);
  const image = { auctionId: 'common', dataUrl: `data:image/jpeg;base64,${Buffer.from([255,216,255,224,255,217]).toString('base64')}` };
  assert.equal((await invoke(uploadImage, image, other.idToken)).status, 403);
  const uploaded = await invoke(uploadImage, image, admin.idToken);
  assert.equal(uploaded.status, 201);
  assert.equal(new URL(uploaded.payload.url).host, storageHost);
  assert.equal((await fetch(uploaded.payload.url)).status, 200, 'Platform image must be publicly readable without a token');

  const draftId = `editor-${run}`;
  const draft = firestore.collection('auctions').doc(draftId);
  const media = firestore.collection('settings').doc(`media-${draftId}`);
  await draft.set({ sellerId: owner.uid, sellerDraftRevision: 0, status: 'draft', title: 'Editor fixture',
    year: 2000, make: 'Test', model: 'Fixture', reserveAmount: 9000 });
  const first = randomUUID(), second = randomUUID();
  for (const id of [first, second]) await draft.collection('draftAssets').doc(id).set({
    removedAt: null, objectPath: `auctionDraft/${draftId}/${id}`
  });
  await media.set({ showcaseChapters: [
    { id: 'exterior', category: 'EXTERIOR', title: 'Exterior Highlights', subtitle: 'Original', narrative: 'Original', specCards: [{ title: 'Kept', value: 'Original specification' }] },
    { id: 'custom', category: 'CUSTOM', title: 'Custom', subtitle: '', narrative: '' }
  ] });
  const edit = { auctionId: draftId, expectedRevision: 0, overviewHeading: 'Updated overview', overviewParagraphs: ['First', 'Second'],
    galleryOrder: [second, first], videoTitle: 'Driving video', videoSubtitle: 'Synthetic footage',
    videoChapters: [{ title: 'Drive', description: 'Synthetic', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
    showcaseEdits: [
      { id: 'exterior', subtitle: 'Updated exterior', narrative: 'Updated narrative', photoAssetId: first },
      { id: 'custom', title: 'Custom inspection', subtitle: 'Details', narrative: 'Notes', highlights: ['Highlight'], photoAssetId: null }
    ] };
  assert.equal((await invoke(saveDraft, edit, other.idToken)).status, 404);
  assert.equal((await invoke(saveDraft, { ...edit, galleryOrder: [first, first] }, owner.idToken)).status, 422);
  assert.equal((await invoke(saveDraft, edit, owner.idToken)).status, 200);
  assert.equal((await invoke(saveDraft, edit, owner.idToken)).status, 409);
  const updated = (await media.get()).data();
  assert.deepEqual(updated.sellerDraftGalleryOrder, [second, first]);
  assert.equal(updated.showcaseChapters[0].title, 'Exterior Highlights');
  assert.equal(updated.showcaseChapters[0].specCards[0].value, 'Original specification');
  assert.equal(updated.showcaseChapters[0].photoAssetId, first);
  assert.equal(updated.showcaseChapters[1].title, 'Custom inspection');
  assert.equal(updated.videoChapters[0].title, 'Drive');
  assert.equal((await draft.get()).get('reserveAmount'), 9000);
  assert.equal((await invoke(readDraft, { auctionId: draftId }, owner.idToken)).status, 200);
  await draft.update({ status: 'pending_review' });
  assert.equal((await invoke(saveDraft, { ...edit, expectedRevision: 1 }, owner.idToken)).status, 409);
  const adminMedia = { auctionId: draftId, config: { heroImages: ['https://example.test/second.jpg', 'https://example.test/first.jpg'],
    fullGallery: [{ id: 'second', url: 'https://example.test/second.jpg' }, { id: 'first', url: 'https://example.test/first.jpg' }],
    overviewHeading: 'Admin overview', overviewParagraphs: ['Persisted paragraph'], videoChapters: edit.videoChapters,
    showcaseChapters: updated.showcaseChapters, privateInternal: 'must not persist' } };
  assert.equal((await invoke(saveMedia, adminMedia, other.idToken)).status, 403);
  assert.equal((await invoke(saveMedia, adminMedia, admin.idToken)).status, 200);
  assert.equal((await media.get()).get('privateInternal'), undefined);
  assert.deepEqual((await media.get()).get('heroImages'), adminMedia.config.heroImages);
  assert.equal((await draft.get()).get('leadHeroImage'), adminMedia.config.heroImages[0]);
  console.log('PASS: watchlists, inquiries, public branding, platform uploads and editor acceptance');
}
