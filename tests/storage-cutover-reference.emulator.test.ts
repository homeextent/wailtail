import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Exercises native atomic-commit/updateTime semantics with the same whole-field
// request shape as the executor. This is not a production restore or GCS test.
test('six native reference writes and recovery are atomic and revision-guarded', async () => {
  const project = 'demo-wailtail-stage3';
  const database = 'ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e';
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host ?? '', /^127\.0\.0\.1:\d+$/);
  assert.equal(process.env.GCLOUD_PROJECT, project);
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'FIREBASE_PRIVATE_KEY']) {
    assert.ok(!process.env[key], `Unset ${key} for isolated tests`);
  }
  const app = initializeApp({projectId:project}, `cutover-${randomUUID()}`);
  const db = getFirestore(app, database);
  const prefix = `projects/${project}/databases/${database}/documents`;
  const base = `http://${host}/v1/`;
  const refs = Array.from({length:6}, (_,i) => db.doc(`cutoverRehearsal/${randomUUID()}-${i}`));
  const headers = {'Authorization':'Bearer owner','Content-Type':'application/json'};
  const read = async () => Promise.all(refs.map(async ref => {
    const response = await fetch(`${base}${prefix}/${ref.path}`, {headers});
    assert.equal(response.status,200);
    return response.json();
  }));
  const commit = (writes: unknown[]) => fetch(`${base}${prefix}:commit`, {method:'POST',headers,body:JSON.stringify({writes})});
  const writes = (docs: any[], value: string) => docs.map(doc => ({
    update:{name:doc.name,fields:{fullGallery:{arrayValue:{values:[{stringValue:value}]}}}},
    updateMask:{fieldPaths:['fullGallery']},currentDocument:{updateTime:doc.updateTime}
  }));
  const galleries = async () => (await db.getAll(...refs)).map(doc => doc.get('fullGallery'));
  try {
    await Promise.all(refs.map(ref => ref.set({fullGallery:['original'],keep:'unchanged'})));
    const initial = await read();
    await refs[0].update({keep:'newer'});
    assert.equal((await commit(writes(initial,'replacement'))).ok,false);
    assert.deepEqual(await galleries(),Array.from({length:6},()=>['original']));
    const response = await commit(writes(await read(),'replacement'));
    assert.equal(response.status,200);
    const result = await response.json();
    assert.equal(result.writeResults.length,6);
    const after = (await read()).map((doc,i)=>({...doc,updateTime:result.writeResults[i].updateTime}));
    assert.deepEqual(await galleries(),Array.from({length:6},()=>['replacement']));
    assert.equal((await commit(writes(after,'original'))).status,200);
    assert.deepEqual(await galleries(),Array.from({length:6},()=>['original']));
    assert.equal((await refs[0].get()).get('keep'),'newer');
    assert.equal((await commit(writes(await read(),'replacement'))).status,200);
    const beforeRecovery = await read();
    await refs[1].update({keep:'later-edit'});
    assert.equal((await commit(writes(beforeRecovery,'original'))).ok,false);
    assert.deepEqual(await galleries(),Array.from({length:6},()=>['replacement']));
    assert.equal((await refs[1].get()).get('keep'),'later-edit');
  } finally {
    await Promise.all(refs.map(ref=>ref.delete()));
    await deleteApp(app);
  }
});
