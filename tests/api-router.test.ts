import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import router from '../api/router';

function response() {
  return {
    statusCode: 200, payload: undefined as any, headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.payload = payload; return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; return this; }
  };
}

test('deployment keeps one function and routes API requests before SPA fallback', () => {
  assert.deepEqual(readdirSync(new URL('../api/', import.meta.url)), ['router.ts']);
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.rewrites[0], {
    source: '/api/:endpoint*', destination: '/api/router?__endpoint=:endpoint*'
  });
  assert.equal(config.functions['api/router.ts'].maxDuration, 60);
  // API misses must return JSON 404, rather than the SPA's HTML document.
  const spa = new RegExp(`^${config.rewrites[1].source}$`);
  assert.ok(spa.test('/auctions/example'));
  assert.ok(!spa.test('/api/missing'));
  assert.ok(!spa.test('/api'));
});

test('router rejects unknown, nested, prototype and ambiguous endpoint names', async () => {
  for (const endpoint of [undefined, '', 'missing', '_lib/firebaseAdmin', '../server/api/public-auctions',
    'constructor', '__proto__', ['public-auctions', 'admin-delete-auction']]) {
    const res = response();
    await router({ method: 'GET', query: { __endpoint: endpoint }, headers: {} }, res);
    assert.equal(res.statusCode, 404, String(endpoint));
    assert.deepEqual(res.payload, { error: 'API endpoint not found.' });
  }
});

test('every deployed handler remains reachable and retains its method guard', async () => {
  const names = readdirSync(new URL('../server/api/', import.meta.url)).filter(name => name.endsWith('.ts'));
  assert.equal(names.length, 28);
  for (const name of names) {
    const res = response();
    await router({ method: 'DELETE', query: { __endpoint: name.slice(0, -3) }, headers: {} }, res);
    assert.equal(res.statusCode, 405, name);
  }
});

test('routed administrator and seller mutations still require credentials', async () => {
  for (const endpoint of ['admin-create-auction', 'admin-delete-auction', 'admin-duplicate-auction',
    'admin-reset-auction-bids', 'admin-update-auction', 'seller-draft-narrative', 'place-auction-bid', 'auction-comments']) {
    const res = response();
    await router({ method: 'POST', query: { __endpoint: endpoint }, headers: {}, body: {} }, res);
    assert.equal(res.statusCode, 401, endpoint);
  }
});

test('router preserves query and method validation at the public handler', async () => {
  const req = { method: 'GET', query: { __endpoint: 'public-auctions', auctionId: 'invalid/path' }, headers: {} };
  const res = response();
  await router(req, res);
  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.payload, { error: 'invalid-auction-id' });
  assert.deepEqual(req.query, { auctionId: 'invalid/path' });
});

test('routed workers retain scheduler authorization', async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'synthetic-router-secret';
  try {
    for (const endpoint of ['reconcile-auction-clock', 'dispatch-auction-notifications']) {
      const res = response();
      await router({ method: 'GET', query: { __endpoint: endpoint }, headers: {} }, res);
      assert.equal(res.statusCode, 401, endpoint);
    }
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
