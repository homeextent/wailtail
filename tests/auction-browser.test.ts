import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';

const origin = 'http://127.0.0.1:4178';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function eventually<T>(read: () => Promise<T>, accept: (value: T) => boolean, label: string): Promise<T> {
  const deadline = Date.now() + 45_000;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await read();
      if (accept(result)) return result;
      last = result;
    } catch (error) { last = String(error); }
    await delay(250);
  }
  throw new Error(`${label} timed out. Last result: ${JSON.stringify(last)}`);
}

test('signed-out catalog and lot render, and administrator inventory renders under candidate rules', { timeout: 240_000 }, async () => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-wailtail-stage3');
  const profile = await mkdtemp(join(tmpdir(), 'wailtail-browser-'));
  const server = spawn(process.execPath, ['--import', 'tsx', 'tests/seller-browser-server.ts'], {
    env: process.env, stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', bytes => { serverLog += String(bytes); });
  server.stderr.on('data', bytes => { serverLog += String(bytes); });
  const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port=9223', `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' });
  let browserError: unknown;
  chrome.on('error', error => { browserError = error; });
  let socket: WebSocket | undefined;
  try {
    const fixture = await eventually<{ projectId: string; publicAuctionId: string } | null>(async () => {
      const response = await fetch(origin + '/fixture', { signal: AbortSignal.timeout(2000) });
      return response.ok ? await response.json() : null;
    }, Boolean, 'isolated app');
    assert.ok(fixture, 'Synthetic fixture must be available');
    assert.equal(fixture.projectId, 'demo-wailtail-stage3');
    const targets = await eventually(async () => {
      if (browserError) throw browserError;
      return await (await fetch('http://127.0.0.1:9223/json', { signal: AbortSignal.timeout(2000) })).json();
    }, value => Array.isArray(value) && value.some(target => target.type === 'page'), 'Chrome debugger');
    socket = new WebSocket(targets.find((target: any) => target.type === 'page').webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener('open', () => resolve(), { once: true });
      socket!.addEventListener('error', () => reject(new Error('Debugger connection failed')), { once: true });
    });
    let sequence = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      if (message.error) call.reject(new Error(JSON.stringify(message.error)));
      else call.resolve(message.result);
    });
    const command = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket!.send(JSON.stringify({ id, method, params }));
    });
    const text = async () => {
      const result = await command('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
      return String(result.result?.value || '');
    };
    await command('Page.navigate', { url: origin + '/catalog?actor=public' });
    const catalog = await eventually(text, value => value.includes('Synthetic public auction'), 'public catalog');
    assert.ok(!catalog.includes('Unrelated synthetic draft'));
    assert.ok(!catalog.includes('Synthetic browser listing'));
    await command('Page.navigate', { url: origin + `/auctions/${fixture.publicAuctionId}?actor=public` });
    await eventually(text, value => value.toLowerCase().includes('synthetic public overview') &&
      value.includes('Synthetic public description'), 'public auction detail');
    const publicResponse = await fetch(origin + `/api/public-auctions?auctionId=${fixture.publicAuctionId}`);
    const publicData = await publicResponse.json();
    assert.equal(publicData.auction.reserveAmount, undefined);
    assert.equal(publicData.auction.sellerEmail, undefined);
    await command('Page.navigate', { url: origin + '/admin?tab=inventory' });
    await eventually(text, value => value.includes('Vehicle Inventory & Lots'), 'administrator portal');
    const selected = await command('Runtime.evaluate', {
      expression: `(() => {
        const button = Array.from(document.querySelectorAll('button')).find(element =>
          element.textContent?.includes('Vehicle Inventory & Lots'));
        if (!button) return false;
        button.click();
        return true;
      })()`,
      returnByValue: true
    });
    assert.equal(selected.result?.value, true, 'Inventory tab must be selectable');
    await eventually(text, value => value.includes('Synthetic browser listing'), 'administrator inventory');
    // Use real controls for member actions and check persisted emulator state.
    await command('Page.navigate', { url: origin + `/auctions/${fixture.publicAuctionId}?actor=admin` });
    await eventually(text, value => value.includes('Synthetic public description'), 'authenticated public lot');
    const click = async (expression: string) => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true });
      assert.equal(result.result?.value, true, expression);
    };
    const state = async () => (await fetch(origin + '/acceptance-fixture')).json();
    await click(`(() => { const b = document.querySelector('button[title="Add to Watchlist"]'); if (!b) return false; b.click(); return true; })()`);
    await eventually(state, value => value.watchCount === 1, 'watchlist persisted');
    await eventually(text, value => value.includes('★ Watching'), 'watching state');
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Contact Consignor / Private Inquiry')); if (!b) return false; b.click(); return true; })()`);
    await eventually(text, value => value.includes('Inquiry Topic'), 'inquiry modal');
    await click(`(() => { const field = document.querySelector('textarea[placeholder^="Please describe your specific question"]'); if (!field) return false; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, 'Synthetic browser inquiry'); field.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Submit Inquiry')); if (!b) return false; b.click(); return true; })()`);
    await eventually(state, value => value.inquiries === 1, 'inquiry persisted');
    await eventually(text, value => value.includes('Inquiry saved. Notification queued'), 'inquiry acknowledgement');

    // Global branding is independent of the currently selected listing.
    await command('Page.navigate', { url: origin + '/admin?tab=branding' });
    await eventually(text, value => value.includes('Site Branding & Global Settings'), 'branding tab available');
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Site Branding & Global Settings')); if (!b) return false; b.click(); return true; })()`);
    await eventually(text, value => value.toLowerCase().includes('platform brand name'), 'branding form');
    const disabledPurge = await command('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('Purge All Catalog Listings') && b.disabled)`, returnByValue: true });
    assert.equal(disabledPurge.result?.value, true);
    await click(`(() => { const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.includes('Platform Brand Name')); const field = label?.parentElement?.querySelector('input'); if (!field) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, 'Updated browser brand'); field.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Save Global Settings')); if (!b) return false; b.click(); return true; })()`);
    await eventually(state, value => value.siteName === 'Updated browser brand', 'branding persisted');
    const publicBranding = await (await fetch(origin + '/api/public-settings')).json();
    assert.equal(publicBranding.branding.siteName, 'Updated browser brand');
    assert.equal(publicBranding.branding.privateAdminField, undefined);

    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Consignment Pipeline')); if (!b) return false; b.click(); return true; })()`);
    await eventually(text, value => value.toLowerCase().includes('synthetic seller'), 'consignment fixture');
    await eventually(async () => {
      const result = await command('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('button')).some(b => b.disabled && b.title.includes('Unavailable in this staging revision') && /Approve|Convert/.test(b.textContent || ''))`, returnByValue: true });
      return result.result?.value;
    }, Boolean, 'disabled consignment conversion');

    // Seller narrative edits go through the same router and survive reload.
    await command('Page.navigate', { url: origin + '/catalog?fixture=draft' });
    await eventually(text, value => value.includes('Overview heading'), 'seller editor');
    await click(`(() => { const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.startsWith('Overview heading')); const field = label?.querySelector('input'); if (!field) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, 'Browser saved overview'); field.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save narrative'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    await eventually(text, value => value.includes('Narrative saved.'), 'seller save acknowledgement');
    await eventually(state, value => value.heading === 'Browser saved overview', 'seller narrative persisted');
    await command('Page.reload');
    await eventually(async () => {
      const value = await command('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('input')).some(input => input.value === 'Browser saved overview')`, returnByValue: true });
      return value.result?.value;
    }, Boolean, 'seller narrative after reload');

  } catch (error) {
    console.error(serverLog);
    throw error;
  } finally {
    socket?.close();
    chrome.kill('SIGTERM');
    server.kill('SIGTERM');
    await Promise.all([chrome, server].map(child => child.exitCode === null
      ? Promise.race([once(child, 'exit').catch(() => {}), delay(3000)]) : Promise.resolve()));
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
    if (server.exitCode === null) server.kill('SIGKILL');
    // Chrome subprocesses can finish writing profile files just after the parent exits.
    // Retry transient directory contention without suppressing cleanup failures.
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
