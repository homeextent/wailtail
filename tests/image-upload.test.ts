import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAndUploadImage } from '../src/utils/imageUpload';

test('image upload returns success and propagates asynchronous upload/compression failures', async () => {
  const original = globalThis.FileReader;
  class Reader {
    result = 'data:image/jpeg;base64,/9j/AA==';
    onload?: () => void;
    readAsDataURL() { queueMicrotask(() => this.onload?.()); }
  }
  globalThis.FileReader = Reader as unknown as typeof FileReader;
  try {
    assert.equal(await readAndUploadImage(new Blob(), async () => 'saved'), 'saved');
    await assert.rejects(readAndUploadImage(new Blob(), async () => {
      await Promise.resolve();
      throw new Error('Public image upload requires a published listing.');
    }), /published listing/);
    await assert.rejects(readAndUploadImage(new Blob(), async () => {
      throw new Error('Compression failed');
    }), /Compression failed/);
  } finally { globalThis.FileReader = original; }
});
