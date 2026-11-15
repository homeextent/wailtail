import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startVisiblePolling } from '../src/services/visiblePolling';
import { publicPollingDelay } from '../src/services/publicPollingPolicy';

class Visibility extends EventTarget {
  visibilityState = 'visible';
  change(value: string) { this.visibilityState = value; this.dispatchEvent(new Event('visibilitychange')); }
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('catalog polling waits 30 seconds, pauses hidden tabs, refreshes on return and cleans up', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const visibility = new Visibility();
  let calls = 0;
  const stop = startVisiblePolling(async () => { calls++; }, 30_000, visibility as any);
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(29_999); await flush(); assert.equal(calls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
  visibility.change('hidden');
  t.mock.timers.tick(120_000); await flush(); assert.equal(calls, 2);
  visibility.change('visible'); await flush(); assert.equal(calls, 3);
  stop(); visibility.change('visible');
  t.mock.timers.tick(120_000); await flush(); assert.equal(calls, 3);
});

test('hidden start and hide/resume during a request do not overlap requests', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const visibility = new Visibility(); visibility.visibilityState = 'hidden';
  let calls = 0;
  let finish!: () => void;
  let signal!: AbortSignal;
  const stop = startVisiblePolling(async current => {
    calls++; signal = current;
    await new Promise<void>(resolve => { finish = resolve; });
  }, 5000, visibility as any);
  assert.equal(calls, 0);
  visibility.change('visible'); assert.equal(calls, 1);
  visibility.change('hidden'); assert.equal(signal.aborted, true);
  visibility.change('visible'); assert.equal(calls, 1);
  finish(); await flush(); t.mock.timers.tick(0); await flush(); assert.equal(calls, 2);
  stop(); assert.equal(signal.aborted, true);
  finish(); await flush(); t.mock.timers.tick(30_000); assert.equal(calls, 2);
});

test('active lot polling retains its five-second cadence', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const stop = startVisiblePolling(async () => { calls++; }, 5000, new Visibility() as any);
  await flush();
  t.mock.timers.tick(4999); await flush(); assert.equal(calls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
  stop();
});

test('non-live lot refresh slows down, then switches to live cadence on the next response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const stop = startVisiblePolling(async () => {
    calls++;
    return publicPollingDelay(true, 0, calls === 1 ? 'sold' : 'active');
  }, 5000, new Visibility() as any);
  await flush();
  t.mock.timers.tick(59_999); await flush(); assert.equal(calls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
  t.mock.timers.tick(5000); await flush(); assert.equal(calls, 3);
  stop();
});

test('failed requests back off to five minutes and successful live responses reset the cadence', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const visibility = new Visibility();
  const stop = startVisiblePolling(async () => {
    calls++;
    return publicPollingDelay(true, calls <= 6 ? calls : 0, 'live');
  }, 5000, visibility as any);
  await flush();
  for (const delay of [30_000, 60_000, 120_000, 240_000, 300_000, 300_000]) {
    const before = calls;
    t.mock.timers.tick(delay - 1); await flush(); assert.equal(calls, before);
    t.mock.timers.tick(1); await flush(); assert.equal(calls, before + 1);
  }
  assert.equal(calls, 7);
  t.mock.timers.tick(5000); await flush(); assert.equal(calls, 8);
  visibility.change('hidden');
  t.mock.timers.tick(600_000); await flush(); assert.equal(calls, 8);
  stop();
});

test('policy preserves imminent auction starts and slows other non-live states', () => {
  const now = 1_000_000;
  for (const status of ['preview', 'ended', 'sold', 'reserve_not_met', undefined]) {
    assert.equal(publicPollingDelay(true, 0, status, undefined, now), 60_000);
  }
  assert.equal(publicPollingDelay(true, 0, 'upcoming', now + 60_001, now), 60_000);
  assert.equal(publicPollingDelay(true, 0, 'upcoming', now + 60_000, now), 5000);
  assert.equal(publicPollingDelay(true, 0, 'upcoming', now - 1000, now), 5000);
  assert.equal(publicPollingDelay(false, 0), 30_000);
  assert.equal(publicPollingDelay(false, 10), 300_000);
});
