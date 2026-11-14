import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

test('final cutover rules deny legacy exceptions and all direct client writes', async () => {
  const projectId = 'demo-wailtail-stage3';
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  assert.match(host ?? '', /^127\.0\.0\.1:\d+$/);
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'FIREBASE_PRIVATE_KEY']) {
    assert.ok(!process.env[key], `Unset ${key} for isolated tests`);
  }
  const bucket = `${projectId}.appspot.com`;
  const app = initializeApp({ projectId, storageBucket: bucket }, 'cutover-rules');
  const paths = [
    'auctionPublic/lot/asset.jpg',
    'auctionPublic/common/logo.svg',
    'auctions/1988-porsche-928-c3uyca60/gallery/1792949925577-tjvc0.jpg',
    'auctions/2019-ram-rebel-3a0455wx/gallery/1793403168695-t0pxg.jpg',
    'auctionDrafts/user/private.jpg',
    'applicationPrivate/application/document.pdf',
    'auctions/lot-test-mtur4abv/hero/protected.jpg'
  ];
  try {
    await Promise.all(paths.map(path => getStorage(app).bucket(bucket).file(path).save(Buffer.from('fixture'), {resumable:false})));
    for (const [index, path] of paths.entries()) {
      const url = `http://${host}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
      const response = await fetch(url);
      if (index < 2) assert.equal(response.status, 200, path);
      else assert.ok([401,403].includes(response.status), `${path}: ${response.status}`);
      const write = await fetch(`http://${host}/v0/b/${bucket}/o?name=${encodeURIComponent(path)}`, {
        method:'POST', headers:{'Content-Type':'application/octet-stream'}, body:Buffer.from('changed')
      });
      assert.ok([401,403].includes(write.status), `write denied: ${path} (${write.status})`);
    }
    const freeze = await initializeTestEnvironment({projectId, storage:{
      host:'127.0.0.1', port:Number(host!.split(':')[1]),
      rules:readFileSync('storage.cutover-freeze.rules','utf8')
    }});
    try {
      for (const path of [paths[0], paths[2], paths[3], paths[6]]) {
        const response = await fetch(`http://${host}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`);
        assert.equal(response.status,200,`maintenance media remains readable: ${path}`);
        const write = await fetch(`http://${host}/v0/b/${bucket}/o?name=${encodeURIComponent(path)}`, {
          method:'POST', headers:{'Content-Type':'application/octet-stream'}, body:Buffer.from('changed')
        });
        assert.ok([401,403].includes(write.status),`maintenance denies client writes: ${path}`);
      }
    } finally {
      await freeze.cleanup();
    }
  } finally {
    await deleteApp(app);
  }
});
