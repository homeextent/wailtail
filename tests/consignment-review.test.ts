import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { handleConsignmentReview, parseConsignmentReview } from '../server/api/admin-consignment-review';

const base = { applicationId: 'application', source: 'consignment_applications', action: 'read' };
const admin = { uid: 'trusted-admin', email: 'jeremygoodmurphy@gmail.com', email_verified: true };
const note = { ...base, action: 'add_note', expectedRevision: 0, commandId: randomUUID(), note: 'Private note' };

test('review parser rejects forged authority, status, invalid paths, assignments and oversized/empty notes', () => {
  assert.ok(parseConsignmentReview(base));
  assert.ok(parseConsignmentReview(note));
  for (const input of [null, [], { ...base, administratorUid: 'spoof' }, { ...base, status: 'approved' },
    { ...base, applicationId: '../private' }, { ...base, source: 'users' }, { ...base, note: 'ignored' },
    { ...base, beforeRevision: -1 }, { ...note, note: ' ' }, { ...note, note: 'x'.repeat(4001) },
    { ...note, expectedRevision: -1 }, { ...note, commandId: '../event' },
    { ...note, assigneeEmail: admin.email }, { ...base, action: 'assign', expectedRevision: 0, commandId: randomUUID(), assigneeEmail: 'seller@example.test' }]) {
    assert.equal(parseConsignmentReview(input), null, JSON.stringify(input));
  }
});

function harness(options: { token?: any; authFailure?: boolean; missing?: boolean; failedCommit?: boolean; revision?: number; event?: any } = {}) {
  const writes: any[] = [];
  const application = { sellerEmail: 'applicant@example.test', status: 'pending', notes: 'Applicant text', dealerId: 'dealer' };
  const ref = (path: string): any => ({ path, collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`),
    orderBy: () => ({ where: () => ({ startAfter: () => ({ limit: () => ({ get: async () => ({ docs: [], size: 0 }) }) }), limit: () => ({ get: async () => ({ docs: [], size: 0 }) }) }) }) }) });
  const services = {
    auth: { verifyIdToken: async (token: string, revoked: boolean) => {
      assert.equal(token, 'test'); assert.equal(revoked, true);
      if (options.authFailure) throw new Error('revoked');
      return options.token ?? admin;
    } },
    firestore: {
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: async (run: any) => {
        const staged: any[] = [];
        const result = await run({ get: async (target: any) => ({ data: () =>
          target.path.startsWith('dealer_profiles/') ? { legalBusinessName: 'Canonical business', verificationStatus: 'suspended', secretExtra: 'omit' } :
          target.path.includes('/events/') ? options.event :
          target.path.startsWith('consignmentReviews/') ? { revision: options.revision ?? 0, assigneeEmail: '' } : options.missing ? undefined : application }),
          create: (...args: any[]) => staged.push(['create', ...args]), set: (...args: any[]) => staged.push(['set', ...args]) });
        if (options.failedCommit) throw new Error('commit failed');
        writes.push(...staged); return result;
      }
    }
  } as any;
  return { writes, application, async call(body: any = base, headers: any = { authorization: 'Bearer test' }, method = 'POST') {
    const res = { code: 200, payload: undefined as any, headers: {} as any, status(n: number) { this.code = n; return this; }, json(value: any) { this.payload = value; return this; }, setHeader(key: string, value: string) { this.headers[key] = value; } };
    await handleConsignmentReview({ method, headers, body }, res, services); return res;
  } };
}

test('inspection returns full applicant and canonical verification data without writes', async () => {
  const h = harness(); const result = await h.call();
  assert.equal(result.code, 200); assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(result.payload.application, h.application);
  assert.deepEqual(result.payload.verifiedInformation, { legalBusinessName: 'Canonical business', verificationStatus: 'suspended' });
  assert.deepEqual(h.writes, []);
});
test('method, missing/revoked/unverified identity and mutable admin role cannot authorize review', async () => {
  assert.equal((await harness().call(base, {}, 'DELETE')).code, 405);
  assert.equal((await harness().call(base, {})).code, 401);
  for (const options of [{ authFailure: true }, { token: { ...admin, email_verified: false } },
    { token: { uid: 'seller', email: 'seller@example.test', email_verified: true, role: 'admin' } }]) {
    const h = harness(options); const r = await h.call(note); assert.ok([401, 403].includes(r.code)); assert.deepEqual(h.writes, []);
  }
  const second = harness({ token: { ...admin, email: 'jeremy@theinnovativegroup.ca' } });
  assert.equal((await second.call()).code, 200);
});
test('notes use authenticated identity and atomic append/revision writes outside application', async () => {
  const h = harness(); assert.equal((await h.call(note)).code, 200);
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[0][2].administratorUid, admin.uid);
  assert.equal(h.writes[0][2].value, note.note);
  assert.equal(h.writes[0][2].revision, 1);
  assert.ok(h.writes.every(write => write[1].path.startsWith('consignmentReviews/')));
});
test('conflicts, missing records and failed commits never report successful saves', async () => {
  for (const [options, expected] of [[{ revision: 1 }, 409], [{ missing: true }, 404], [{ failedCommit: true }, 503]] as const) {
    const h = harness(options); assert.equal((await h.call(note)).code, expected); assert.deepEqual(h.writes, []);
  }
});
test('retry is idempotent only for the same authenticated author and exact command', async () => {
  const event = { action: 'add_note', value: note.note, administratorUid: admin.uid };
  const h = harness({ event, revision: 1 }); assert.equal((await h.call(note)).code, 200); assert.deepEqual(h.writes, []);
  assert.equal((await harness({ event: { ...event, administratorUid: 'other' } }).call(note)).code, 409);
  assert.equal((await harness({ event }).call({ ...note, note: 'Different' })).code, 409);
});
