import { moveVisiblePhoto } from '../src/utils/photoOrdering';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPublishedDraftImages, parseImagePlacement } from '../server/api/_lib/draftImagePlacement';

test('image placement validates categories and preserves legacy uploads as gallery', () => {
  assert.deepEqual(parseImagePlacement({}), { placement: 'gallery', category: 'exterior' });
  assert.equal(parseImagePlacement({ placement: 'overview' }), null);
  assert.equal(parseImagePlacement({ placement: 'hero', category: '../private' }), null);
});
test('publication maps hero/gallery/chapter assets without private paths and replaces prior copies', () => {
  const result = applyPublishedDraftImages({ heroImages: ['old'], fullGallery: [], draftPublishedUrls: ['old'],
    showcaseChapters: [{ id: 'chapter', photoAssetId: 'hero' }] }, [
    { id: 'hero', placement: 'hero', category: 'exterior', removedAt: null, publishedUrl: 'new', objectPath: 'private' },
    { id: 'gallery', placement: 'gallery', category: 'interior', removedAt: null, publishedUrl: 'gallery' },
    { id: 'removed', placement: 'hero', removedAt: 1, publishedUrl: 'removed' }
  ]);
  assert.deepEqual(result.heroImages, ['new']);
  assert.equal(result.fullGallery[0].category, 'interior');
  assert.equal(result.showcaseChapters[0].photoUrl, 'new');
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('filtered photo ordering swaps visible neighbours and preserves hidden slots and boundaries', () => {
  const photos = [{id:'a', category:'exterior'}, {id:'b', category:'interior'}, {id:'c', category:'exterior'}, {id:'d', category:'engine'}];
  const exterior = (photo: typeof photos[number]) => photo.category === 'exterior';
  assert.deepEqual(moveVisiblePhoto(photos, 0, 1, exterior).map(photo => photo.id), ['c','b','a','d']);
  assert.deepEqual(moveVisiblePhoto(photos, 2, -1, exterior).map(photo => photo.id), ['c','b','a','d']);
  assert.equal(moveVisiblePhoto(photos, 0, -1, exterior), photos);
  assert.equal(moveVisiblePhoto(photos, 2, 1, exterior), photos);
  assert.equal(moveVisiblePhoto(photos, 1, 1, exterior), photos);
  assert.deepEqual(moveVisiblePhoto(photos, 0, 1, () => true).map(photo => photo.id), ['b','a','c','d']);
});
