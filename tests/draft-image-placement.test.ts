import { decodeDraftFile } from '../server/api/_lib/draftFile';
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

test('draft files validate MIME/byte agreement, size and PDF boundaries', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1sAAAAASUVORK5CYII=', 'base64');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
  assert.ok(decodeDraftFile(png.toString('base64'), 'image/png'));
  assert.ok(decodeDraftFile(pdf.toString('base64'), 'application/pdf'));
  assert.equal(decodeDraftFile(png.toString('base64'), 'image/jpeg'), null);
  assert.equal(decodeDraftFile(pdf.toString('base64'), 'image/png'), null);
  assert.equal(decodeDraftFile(Buffer.from('%PDF-1.4\ntruncated').toString('base64'), 'application/pdf'), null);
  assert.equal(decodeDraftFile(Buffer.from('<svg/>').toString('base64'), 'image/png'), null);
  assert.equal(decodeDraftFile(Buffer.alloc(2*1024*1024+1).toString('base64'), 'application/pdf'), null);
  const media = applyPublishedDraftImages({heroImages:[],fullGallery:[]}, [{id:'pdf',removedAt:null,contentType:'application/pdf',placement:'gallery',category:'documentation',title:'Service report.pdf',publishedUrl:'public.pdf'}]);
  assert.equal(media.fullGallery[0].isPdf,true); assert.equal(media.fullGallery[0].title,'Service report.pdf');
});
