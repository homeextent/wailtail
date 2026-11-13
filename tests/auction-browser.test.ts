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
      if (accept(result)) { console.log('Browser check passed:', label); return result; }
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
  const browserErrors: unknown[] = [];
  const pendingRequests = new Map<string, string>();
  try {
    const fixture = await eventually<{ projectId: string; publicAuctionId: string; dealerRepresentativeUid: string } | null>(async () => {
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
      if (message.method === 'Page.javascriptDialogOpening') {
        browserErrors.push({ unexpectedDialog: message.params.message });
        socket!.send(JSON.stringify({ id: ++sequence, method: 'Page.handleJavaScriptDialog', params: { accept: false } }));
        for (const call of pending.values()) call.reject(new Error('Unexpected browser dialog: ' + message.params.message));
        pending.clear();
        return;
      }
      if (message.method === 'Network.requestWillBeSent') {
        const url = new URL(message.params.request.url);
        pendingRequests.set(message.params.requestId, url.origin + url.pathname);
      }
      if (['Network.loadingFinished', 'Network.loadingFailed'].includes(message.method)) pendingRequests.delete(message.params.requestId);
      if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') browserErrors.push(message.params.args);
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      if (message.error) call.reject(new Error(JSON.stringify(message.error)));
      else call.resolve(message.result);
    });
    const command = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Chrome command timed out: ' + method)); }, 15000);
      pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); }
      });
      socket!.send(JSON.stringify({ id, method, params }));
    });
    const text = async () => {
      const result = await command('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
      return String(result.result?.value || '');
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Network.enable');
    await command('Page.navigate', { url: origin + '/catalog?actor=public' });
    const catalog = await eventually(text, value => value.includes('Synthetic public auction'), 'public catalog');
    assert.ok(catalog.includes('Verified Boutique Dealer'));
    assert.ok(catalog.includes('Synthetic Public Dealer'));
    assert.ok(!catalog.includes('Unrelated synthetic draft'));
    assert.ok(!catalog.includes('Synthetic browser listing'));
    await command('Page.navigate', { url: origin + `/auctions/${fixture.publicAuctionId}?actor=public` });
    await eventually(text, value => value.toLowerCase().includes('synthetic public overview') &&
      value.includes('Synthetic public description'), 'public auction detail');
    const publicResponse = await fetch(origin + `/api/public-auctions?auctionId=${fixture.publicAuctionId}`);
    const publicData = await publicResponse.json();
    await eventually(text, value => value.includes('Verified Boutique Dealer') && value.includes('Dealer documentation fee: CAD $0') && value.includes('Dealer collects applicable tax at settlement.'), 'public dealer disclosures');
    assert.equal(publicData.auction.publicDealer.verified, true);
    assert.equal(publicData.auction.publicDealer.phone, '+1 905 555 0100');
    assert.ok(!JSON.stringify(publicData).includes('PRIVATE-DEALER-ADDRESS'));
    assert.ok(!JSON.stringify(publicData).includes('PRIVATE-LICENCE'));
    const dealerLinks = await command('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('section[aria-label="Dealer information"] a')).map(a => a.getAttribute('href'))`, returnByValue: true });
    assert.deepEqual(dealerLinks.result.value, ['tel:+19055550100', 'https://example.test/']);
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await eventually(async () => (await command('Runtime.evaluate', { expression: `({ width: window.innerWidth, overflow: Array.from(document.body.querySelectorAll('*')).filter(e => e.getBoundingClientRect().right > 391 && e.getBoundingClientRect().width > 0).slice(0, 12).map(e => ({ tag: e.tagName, className: String(e.className).slice(0, 160), right: Math.round(e.getBoundingClientRect().right) })) })`, returnByValue: true })).result.value,
      value => value.width === 390, 'actual mobile layout viewport is 390 CSS pixels');
    const dealerMobile = await command('Runtime.evaluate', { expression: `(() => { const panel = document.querySelector('section[aria-label="Dealer information"]'); const details = panel.querySelector('details'); return { width: window.innerWidth, mobile: matchMedia('(max-width: 639px)').matches, fits: panel.scrollWidth <= panel.clientWidth, height: panel.getBoundingClientRect().height, collapsed: !details.open, contactHidden: !panel.querySelector('a').checkVisibility() }; })()`, returnByValue: true });
    assert.equal(dealerMobile.result.value.mobile, true);
    assert.equal(dealerMobile.result.value.fits, true, 'dealer disclosures fit mobile panel');
    assert.equal(dealerMobile.result.value.collapsed, true);
    assert.equal(dealerMobile.result.value.contactHidden, true);
    assert.ok(dealerMobile.result.value.height <= 270, 'collapsed dealer panel leaves room for vehicle and bidding');
    await command('Runtime.evaluate', { expression: `document.querySelector('section[aria-label="Dealer information"] summary').click()` });
    const expanded = await command('Runtime.evaluate', { expression: `(() => { const p = document.querySelector('section[aria-label="Dealer information"]'); return { open: p.querySelector('details').open, contactVisible: p.querySelector('a').checkVisibility(), notice: p.innerText.includes('not provincial regulatory endorsement'), fits: p.scrollWidth <= p.clientWidth }; })()`, returnByValue: true });
    assert.deepEqual(expanded.result.value, { open: true, contactVisible: true, notice: true, fits: true });
    await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

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
    const oversizedDelete = await command('Runtime.evaluate', {
      expression: `(() => {
        const row = Array.from(document.querySelectorAll('tr')).find(row => row.textContent?.includes('Synthetic browser listing'));
        const button = row?.querySelector('button[title="Delete Lot"]');
        if (!button) return false; button.click(); return true;
      })()`, returnByValue: true
    });
    assert.equal(oversizedDelete.result?.value, true);
    await eventually(text, value => value.includes('Yes, Delete Lot'), 'delete confirmation');
    await command('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Yes, Delete Lot')).click()` });
    await eventually(text, value => value.includes('Failed to delete lot: Listing requires a separate large-record cleanup.'), 'oversized deletion error toast');
    assert.ok((await text()).includes('Synthetic browser listing'), 'Rejected deletion must retain the listing');
    // Service entry points must also reject retired actions before network writes.
    const retired = await command('Runtime.evaluate', {
      expression: `(async () => {
        const service = await import('/src/services/auctionService.ts');
        const messages = [];
        for (const name of ['purgeAllListings', 'banOrRemoveBidder', 'convertConsignmentToDraftListing']) {
          if (typeof service[name] !== 'function') continue;
          try { await service[name](); messages.push('unexpected-success'); }
          catch (error) { messages.push(error.message); }
        }
        return messages;
      })()`, awaitPromise: true, returnByValue: true
    });
    assert.equal(retired.result?.value.length, 3);
    assert.ok(retired.result.value.every((message: string) => message.includes('disabled')));
    // Use real controls for member actions and check persisted emulator state.
    await command('Page.navigate', { url: origin + `/auctions/${fixture.publicAuctionId}?actor=admin` });
    await eventually(text, value => value.includes('Synthetic public description'), 'authenticated public lot');
    const click = async (expression: string) => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true });
      assert.equal(result.result?.value, true, expression);
    };
    const state = async () => (await fetch(origin + '/acceptance-fixture')).json();
    await command('Page.navigate', { url: origin + `/dashboard/listings/${fixture.publicAuctionId}/edit?actor=admin` });
    await eventually(text, value => value.includes('Social Kit'), 'public dealer admin editor');
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Social Kit')); if (!b) return false; b.click(); return true; })()`);
    await eventually(text, value => value.includes('Seller Social Marketing Kit'), 'dealer social kit opens');
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Enthusiast Copy Generator')); if (!b) return false; b.click(); return true; })()`);
    await eventually(async () => (await command('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('textarea')).map(t => t.value).join('\\n')`, returnByValue: true })).result.value,
      value => value.includes('Verified Boutique Dealer on WAILTAIL') && value.includes('Synthetic Public Dealer') && value.includes('not provincial regulatory endorsement'), 'dealer-specific social copy');
    const readPromo = async () => (await command('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('textarea')).map(t => t.value).join('\\n')`, returnByValue: true })).result.value;
    const forumCopy = await readPromo();
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Marketplace Pitch')); if (!b) return false; b.click(); return true; })()`);
    await eventually(readPromo, value => value !== forumCopy && value.includes('LIVE NOW') && value.includes('join the bidding'), 'marketplace dealer promotion differs');
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('X / Twitter Thread')); if (!b) return false; b.click(); return true; })()`);
    await eventually(readPromo, value => value.includes('1/3') && value.includes('2/3') && value.includes('3/3'), 'dealer thread has three posts');
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Ending Soon'); if (!b) return false; b.click(); return true; })()`);
    await eventually(readPromo, value => value.includes('ENDING SOON') && value.includes('bid before close'), 'dealer ending-soon campaign promotes actual open auction');
    await command('Page.navigate', { url: origin + `/auctions/${fixture.publicAuctionId}?actor=admin` });
    await eventually(text, value => value.includes('Synthetic public description'), 'public lot after social preview');

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
    await eventually(async () => {
      const result = await command('Runtime.evaluate', { expression: `(() => { const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.includes('Platform Brand Name')); return label?.parentElement?.querySelector('input')?.value; })()`, returnByValue: true });
      return result.result?.value;
    }, value => value === 'Synthetic Wailtail Brand', 'initial branding subscription loaded');
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

    // M2.1 inspection is read-only; internal notes/assignment persist across full navigation.
    const clickReviewButton = async (label: string) => click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === ${JSON.stringify(label)}); if (!b || b.disabled) return false; b.click(); return true; })()`);
    await clickReviewButton('View application');
    await eventually(text, value => value.includes('Applicant condition disclosure') && value.includes('5-Speed Manual') && value.includes('No internal review events recorded.'), 'application inspection');
    assert.equal((await state()).consignmentStatus, 'pending');
    await click(`(() => { const field = document.querySelector('textarea[aria-label="Internal note"]'); if (!field) return false; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, 'Private browser review note'); field.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    // A failed save keeps the draft note visible and does not create a success event.
    await command('Runtime.evaluate', { expression: `(() => { const realFetch = window.fetch; window.fetch = async (...args) => { if (String(args[0]).includes('/api/admin-consignment-review') && JSON.parse(args[1]?.body || '{}').action === 'add_note') { window.fetch = realFetch; return new Response('{}', {status:503}); } return realFetch(...args); }; })()` });
    await clickReviewButton('Save internal note');
    await eventually(text, value => value.includes('Could not complete the review request.'), 'review save failure');
    const retainedNote = await command('Runtime.evaluate', { expression: `document.querySelector('textarea[aria-label="Internal note"]').value`, returnByValue: true });
    assert.equal(retainedNote.result?.value, 'Private browser review note');
    assert.equal((await state()).consignmentStatus, 'pending');
    await clickReviewButton('Save internal note');
    await eventually(text, value => value.includes('Private browser review note') && value.includes('jeremygoodmurphy@gmail.com · #1'), 'internal note persisted');
    await click(`(() => { const field = document.querySelector('select[aria-label="Assigned curator"]'); if (!field) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, 'jeremy@theinnovativegroup.ca'); field.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await clickReviewButton('Save assignment');
    await eventually(text, value => value.includes('Curator assignment: jeremy@theinnovativegroup.ca'), 'assignment persisted');
    await clickReviewButton('Close');
    await command('Page.navigate', { url: origin + '/admin?tab=consignments' });
    await eventually(text, value => value.includes('View application'), 'pipeline after reload');
    await clickReviewButton('View application');
    await eventually(text, value => value.includes('Private browser review note') && value.includes('Curator assignment: jeremy@theinnovativegroup.ca'), 'review survives reload');
    assert.equal((await state()).consignmentStatus, 'pending');
    await clickReviewButton('Close');

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


    // M2.2 actual public intake component: declarations, failure retention and both applicant paths.
    await command('Page.navigate', { url: origin + '/intake' });
    await eventually(text, value => value.includes('Who is submitting this vehicle?'), 'public intake');
    // Use real wheel input: programmatic field setters alone cannot detect clipped forms.
    const scrollMetrics = async () => {
      const result = await command('Runtime.evaluate', { expression: `(() => {
        const scroller = document.querySelector('[data-testid="intake-scroll-region"]');
        const rect = scroller.getBoundingClientRect();
        const notes = scroller.querySelector('textarea').getBoundingClientRect();
        const year = scroller.querySelector('select[aria-label="Vehicle year"]').getBoundingClientRect();
        const submit = document.querySelector('button[type="submit"]').getBoundingClientRect();
        return { top: scroller.scrollTop, height: scroller.clientHeight, full: scroller.scrollHeight,
          x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
          notesVisible: notes.top >= rect.top && notes.bottom <= rect.bottom,
          yearVisible: year.top >= rect.top && year.bottom <= rect.bottom,
          footerVisible: submit.top >= 0 && submit.bottom <= innerHeight,
          width: scroller.clientWidth, fullWidth: scroller.scrollWidth };
      })()`, returnByValue: true });
      return result.result.value;
    };
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      await command('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
      for (const type of ['private', 'dealer']) {
        await click(`(() => { document.querySelector('input[name="applicantType"][value="${type}"]').click(); return true; })()`);
        const before = await scrollMetrics();
        assert.ok(before.height > 0 && before.full > before.height, `${type}: form must have a bounded scroll viewport`);
        assert.ok(before.fullWidth <= before.width + 1, `${type}: no horizontal clipping`);
        await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: before.x, y: before.y, deltaX: 0, deltaY: -10000 });
        await eventually(scrollMetrics, value => value.top === 0, `${type} ${viewport.width}: scroll to top`);
        await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: before.x, y: before.y, deltaX: 0, deltaY: 10000 });
        const bottom = await eventually(scrollMetrics, value => value.top > 0 && value.notesVisible && value.footerVisible,
          `${type} ${viewport.width}: wheel reaches vehicle/contact fields and footer`);
        assert.ok(bottom.top >= bottom.full - bottom.height - 2, 'wheel must reach the bottom of the form');
        // A user can also wheel back to the required vehicle year, including dealer mode.
        for (let step = 0; step < 15; step++) {
          const current = await scrollMetrics(); if (current.yearVisible) break;
          await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: current.x, y: current.y, deltaX: 0, deltaY: -120 });
          await delay(60);
        }
        assert.equal((await scrollMetrics()).yearVisible, true, `${type} ${viewport.width}: vehicle year must be reachable`);
        await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: before.x, y: before.y, deltaX: 0, deltaY: -10000 });
        await eventually(scrollMetrics, value => value.top === 0, 'reset form scroll');
      }
    }
    await command('Emulation.clearDeviceMetricsOverride');
    const fill = async (selector: string, value: string, select = false) => click(`(() => {
      const field = document.querySelector(${JSON.stringify(selector)}); if (!field) return false;
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : ${select ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event('${select ? 'change' : 'input'}', {bubbles:true})); return true;
    })()`);
    const submitIntake = async () => { await command('Runtime.evaluate', { expression: `document.querySelector('form[aria-label="Vehicle consignment application"]').requestSubmit()` }); };
    const intakeRecords = async () => (await fetch(origin + '/intake-fixture')).json();
    await click(`(() => { document.querySelector('input[name="applicantType"][value="dealer"]').click(); return true; })()`);
    await eventually(text, value => value.includes('Dealership details'), 'dealer fields');
    await fill('select[aria-label="Vehicle year"]', '1988', true);
    await fill('select[aria-label="Vehicle make"]', 'OTHER_CUSTOM', true);
    await fill('input[placeholder="Enter custom make..."]', 'Synthetic');
    await fill('input[placeholder="Enter custom model..."]', 'Dealer Fixture');
    await fill('input[aria-label="Legal business name"]', 'Synthetic Dealer Inc.');
    await fill('input[aria-label="Trade name / DBA (optional)"]', 'Synthetic Collectors');
    await fill('input[aria-label="Dealer licence number"]', 'TEST-456');
    await fill('select[aria-label="Licensing province or territory"]', 'ON', true);
    await fill('input[aria-label="Representative name"]', 'Dealer browser representative');
    await fill('input[aria-label="Representative email"]', 'intake-browser@example.test');
    await fill('input[aria-label="Representative phone"]', '905-555-0123');
    await click(`(() => { const declarations = document.querySelectorAll('fieldset fieldset input[type="checkbox"]'); declarations[0].click(); declarations[1].click(); document.querySelector('input[aria-label="Ownership and terms agreement"]').click(); return true; })()`);
    const submitEnabled = async () => {
      const result = await command('Runtime.evaluate', { expression: `!document.querySelector('button[type="submit"]').disabled`, returnByValue: true });
      return result.result.value;
    };
    assert.equal(await submitEnabled(), false, 'missing third declaration must visibly disable submit');
    await submitIntake();
    assert.equal((await intakeRecords()).length, 0, 'missing third declaration must prevent persistence');
    await click(`(() => { document.querySelectorAll('fieldset fieldset input[type="checkbox"]')[2].click(); return true; })()`);
    assert.equal(await submitEnabled(), true, 'complete dealer intake must enable submit');
    for (let index = 0; index < 3; index++) {
      await click(`(() => { document.querySelectorAll('fieldset fieldset input[type="checkbox"]')[${index}].click(); return true; })()`);
      assert.equal(await submitEnabled(), false, `declaration ${index + 1} must be mandatory`);
      await submitIntake();
      assert.equal((await intakeRecords()).length, 0, 'unchecked declaration must never persist a dealer application');
      await click(`(() => { document.querySelectorAll('fieldset fieldset input[type="checkbox"]')[${index}].click(); return true; })()`);
    }
    await fill('input[aria-label="Dealer licence number"]', '');
    assert.equal(await submitEnabled(), true, 'field validation must remain accessible after declarations are accepted');
    await submitIntake();
    assert.equal((await intakeRecords()).length, 0, 'missing licence must still block submission');
    await fill('input[aria-label="Dealer licence number"]', 'TEST-456');
    assert.equal(await submitEnabled(), true);

    await command('Runtime.evaluate', { expression: `(() => { const realFetch = window.fetch; window.fetch = async (...args) => { if (String(args[0]).includes('/api/submit-consignment')) { window.fetch = realFetch; return new Response(JSON.stringify({error:'Synthetic persistence failure'}), {status:503, headers:{'Content-Type':'application/json'}}); } return realFetch(...args); }; })()` });
    await submitIntake();
    await eventually(text, value => value.includes('Synthetic persistence failure'), 'intake failure retained');
    const retainedDealer = await command('Runtime.evaluate', { expression: `document.querySelector('input[aria-label="Legal business name"]').value`, returnByValue: true });
    assert.equal(retainedDealer.result?.value, 'Synthetic Dealer Inc.'); assert.equal((await intakeRecords()).length, 0);
    await command('Runtime.evaluate', { expression: `(() => {
      const values = { submittedDealershipName: 'Autofilled Dealer Inc.', sellerName: 'Autofilled Representative', sellerPhone: '905-555-9999', locationCity: 'Autofilled City' };
      for (const [name, value] of Object.entries(values)) Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(document.querySelector('input[name="' + name + '"]'), value);
    })()` });
    assert.equal(await submitEnabled(), true, 'visible autofilled text must not be locked behind stale React state');
    await submitIntake();
    await eventually(text, value => value.includes('Consignment Request Received!'), 'dealer submission success');
    assert.ok((await text()).includes('Synthetic Dealer Fixture'), 'success view preserves custom vehicle identity');
    const dealerRecords = await eventually(intakeRecords, value => value.length === 1, 'dealer persisted');
    assert.equal(dealerRecords[0].applicantType, 'dealer'); assert.equal(dealerRecords[0].status, 'pending');
    assert.equal(dealerRecords[0].noBrokeredInventoryDeclaration, true); assert.equal(dealerRecords[0].declarationAcceptedAt, dealerRecords[0].submittedAt);
    assert.equal(dealerRecords[0].dealerId, undefined);
    assert.equal(dealerRecords[0].submittedDealershipName, 'Autofilled Dealer Inc.');
    assert.equal(dealerRecords[0].sellerName, 'Autofilled Representative');
    assert.equal(dealerRecords[0].sellerPhone, '905-555-9999');
    assert.equal(dealerRecords[0].locationCity, 'Autofilled City');
    await command('Page.navigate', { url: origin + '/intake' });
    await eventually(text, value => value.includes('Who is submitting this vehicle?'), 'private intake');
    assert.ok(!(await text()).includes('Dealership details'));
    await fill('select[aria-label="Vehicle year"]', '2026', true);
    await fill('select[aria-label="Vehicle make"]', 'Alpina', true);
    await fill('select[aria-label="Vehicle model"]', 'B5', true);
    await fill('input[aria-label="Your name"]', 'Private browser owner');
    await fill('input[aria-label="Email address"]', 'intake-browser@example.test');
    await click(`(() => { document.querySelector('input[aria-label="Ownership and terms agreement"]').click(); return true; })()`);
    await submitIntake();
    await eventually(text, value => value.includes('Consignment Request Received!'), 'private submission success');
    const both = await eventually(intakeRecords, value => value.length === 2, 'private and dealer persisted');
    assert.ok(both.some(record => record.applicantType === 'private' && record.status === 'pending' && record.make === 'Alpina' && record.model === 'B5' && record.year === '2026' && !record.submittedDealershipName));
    await command('Page.navigate', { url: origin + '/admin?tab=consignments' });
    await eventually(text, value => value.includes('Dealer Fixture'), 'dealer pipeline');
    await click(`(() => { const row = Array.from(document.querySelectorAll('[id^="consignment-"]')).find(row => row.textContent?.includes('Dealer Fixture')); const button = Array.from(row?.querySelectorAll('button') || []).find(b => b.textContent === 'View application'); if (!button) return false; button.click(); return true; })()`);
    await eventually(text, value => value.includes('Autofilled Dealer Inc.') && value.includes('Synthetic Collectors') && value.includes('TEST-456') && value.includes('No brokered or pass-through inventory declaration'), 'dealer declarations in M2.1 review');
    assert.ok((await text()).includes('No linked canonical dealer verification information.'));
    // M2.3 actual admin panel -> native API -> emulator Auth and atomic Firestore records.
    const verificationState = async () => (await fetch(origin + '/dealer-verification-fixture/' + dealerRecords[0].id)).json();
    const manageVerification = async () => {
      await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Manage dealer verification'); if (!b) return false; b.click(); return true; })()`);
      await eventually(text, value => value.includes('Applicant declarations (unverified)') && value.includes('No verification actions recorded.'), 'verification opens without writes');
    };
    await manageVerification();
    assert.equal((await verificationState()).review, undefined);
    await fill('textarea[aria-label="Verification findings"]', 'Awaiting independent licence confirmation');
    const saveVerification = async () => {
      await command('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save verification action')?.scrollIntoView({block:'end'})` });
      await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save verification action'); if (!b || b.disabled) return false; b.click(); return true; })()`);
      await eventually(text, value => value.includes('Verification action saved.'), 'verification action persisted');
      await eventually(async () => {
        const result = await command('Runtime.evaluate', { expression: `(() => { const el = document.querySelector('[aria-label="Verification result"]'); const bounds = el?.getBoundingClientRect(); return !!bounds && bounds.top >= 0 && bounds.bottom <= innerHeight && document.activeElement === el; })()`, returnByValue: true });
        return result.result?.value;
      }, Boolean, 'save result visible and focused after scrolling from button');
    };
    await saveVerification();
    assert.equal((await verificationState()).profile, null);
    await command('Emulation.setTimezoneOverride', { timezoneId: 'America/Toronto' });
    await fill('select[aria-label="Verification action"]', 'verified', true);
    await fill('select[aria-label="Account lookup type"]', 'uid', true);
    await fill('input[aria-label="Account lookup value"]', 'missing-synthetic-representative');
    const findAccount = () => click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Find representative account'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    await findAccount();
    await eventually(text, value => value.includes('No account matches that exact email or UID'), 'missing account lookup error shown');
    const errorFeedback = await command('Runtime.evaluate', { expression: `(() => { const el = document.querySelector('[aria-label="Verification result"]'); const bounds = el?.getBoundingClientRect(); return !!bounds && bounds.top >= 0 && bounds.bottom <= innerHeight && document.activeElement === el; })()`, returnByValue: true });
    assert.equal(errorFeedback.result?.value, true, 'error feedback scrolls into view and receives focus');
    await fill('input[aria-label="Account lookup value"]', fixture.dealerRepresentativeUid);
    await findAccount();
    await eventually(text, value => value.includes('Account eligible; confirm representative authority'), 'exact representative lookup');
    const beforeSelection = await command('Runtime.evaluate', { expression: `document.querySelector('input[name="primaryRepresentativeUid"]').value`, returnByValue: true });
    assert.equal(beforeSelection.result?.value, '', 'lookup must not select automatically');
    const emailResult = await command('Runtime.evaluate', { expression: `document.querySelector('[data-testid="representative-account-email"]').textContent`, returnByValue: true });
    await fill('select[aria-label="Account lookup type"]', 'email', true);
    await fill('input[aria-label="Account lookup value"]', emailResult.result.value);
    await findAccount();
    await eventually(text, value => value.includes('Account eligible; confirm representative authority'), 'exact email lookup');
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Confirm and select this representative'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    const selection = await command('Runtime.evaluate', { expression: `document.querySelector('input[name="primaryRepresentativeUid"]').value`, returnByValue: true });
    assert.equal(selection.result?.value, fixture.dealerRepresentativeUid);
    assert.equal((await verificationState()).events, 1, 'lookup and selection create no decision');
    for (const [label, value] of [
      ['Verified legal business name', 'Canonical Browser Dealer Inc.'], ['Verified dealer licence number', 'BROWSER-789'],
      ['Business street address', '1 Synthetic Street'],
      ['Business postal code', 'L2R1A1'], ['Business city', 'St. Catharines'], ['Business phone', '905-555-0100']
    ]) await fill(`input[aria-label="${label}"]`, value);
    for (const label of ['Licensing province / territory', 'Business province / territory']) await fill(`select[aria-label="${label}"]`, 'ON', true);
    await fill('select[aria-label="Verification method"]', 'Other', true);
    await fill('input[aria-label="Other verification method"]', 'Manual synthetic regulator check');
    await fill('select[aria-label="Verification source type"]', 'Other', true);
    await fill('textarea[aria-label="Source / reference description"]', 'Synthetic registry and representative authorization reference');
    const browserDates = await command('Runtime.evaluate', { expression: `[-60000,86400000].map(offset => { const d = new Date(Date.now()+offset); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); })`, returnByValue: true });
    await fill('input[aria-label="Manual check time local"]', browserDates.result.value[0]);
    await fill('input[aria-label="Verification expiry local"]', browserDates.result.value[1]);
    const expectedDates = await command('Runtime.evaluate', { expression: `['checkedAt','expiry'].map(name => new Date(document.querySelector('input[name="'+name+'"]').value).getTime())`, returnByValue: true });
    await fill('textarea[aria-label="Verification findings"]', 'Manually confirmed synthetic business, licence and representative authority. No public contact consent.');
    await saveVerification();
    const verified = await eventually(verificationState, value => value.profile?.verificationStatus === 'verified', 'canonical dealer and links committed');
    assert.equal(verified.profile.checkedAt, expectedDates.result.value[0]);
    assert.equal(verified.profile.verificationExpiresAt, expectedDates.result.value[1]);
    assert.equal(verified.profile.verificationMethod, 'Manual synthetic regulator check'); assert.equal(verified.profile.sourceReferenceType, 'Other');
    assert.equal(verified.events, 2); assert.equal(verified.user.dealerId, verified.profile.id); assert.equal(verified.bidder.dealerId, verified.profile.id);
    assert.equal(verified.user.role, 'bidder'); assert.equal(verified.application.status, 'pending'); assert.equal(verified.application.dealerId, undefined);
    assert.equal(verified.profile.displayPhonePublicly, false); assert.equal(verified.profile.displayWebsitePublicly, false);
    assert.equal(verified.profile.city, 'St. Catharines'); assert.equal(verified.application.locationCity, 'Autofilled City');
    await fill('select[aria-label="Verification action"]', 'suspended', true);
    await fill('textarea[aria-label="Verification findings"]', 'Synthetic administrative suspension');
    await saveVerification();
    await eventually(verificationState, value => value.profile?.verificationStatus === 'suspended' && value.events === 3, 'suspension audited');
    await command('Page.navigate', { url: origin + '/admin?tab=consignments' });
    await eventually(text, value => value.includes('Dealer Fixture'), 'dealer pipeline after verification reload');
    await click(`(() => { const row = Array.from(document.querySelectorAll('[id^="consignment-"]')).find(row => row.textContent?.includes('Dealer Fixture')); const b = Array.from(row?.querySelectorAll('button') || []).find(b => b.textContent === 'View application'); if (!b) return false; b.click(); return true; })()`);
    await eventually(text, value => value.includes('Canonical Browser Dealer Inc.') && value.includes('suspended'), 'canonical verification visible in application review after reload');
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Manage dealer verification'); if (!b) return false; b.click(); return true; })()`);
    await eventually(text, value => value.includes('Synthetic administrative suspension') && value.includes('Immutable private verification history'), 'verification history survives reload');
    await fill('select[aria-label="Verification action"]', 'verified', true);
    const restored = await command('Runtime.evaluate', { expression: `({method:document.querySelector('input[aria-label="Other verification method"]').value, checkedAt:document.querySelector('input[name="checkedAt"]').value, expiry:document.querySelector('input[name="expiry"]').value})`, returnByValue: true });
    assert.equal(restored.result.value.method, 'Manual synthetic regulator check');
    assert.equal(restored.result.value.checkedAt, browserDates.result.value[0]); assert.equal(restored.result.value.expiry, browserDates.result.value[1]);
    // M2.4: explicitly reverify, curate the vehicle, and create the assigned dealer draft.
    await fill('textarea[aria-label="Verification findings"]', 'Synthetic re-verification for vehicle conversion');
    await saveVerification();
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Back to application'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    await eventually(text, value => value.includes('Dealer eligible: Yes'), 'conversion eligibility from current canonical verification');
    await fill('textarea[aria-label="Dealer vehicle approval reason"]', 'Synthetic vehicle separately reviewed and accepted for draft creation');
    await click(`(() => { const box = document.querySelector('input[aria-label="Confirm dealer vehicle approval"]'); if (!box) return false; box.click(); return true; })()`);
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Approve vehicle and create dealer draft'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    await eventually(text, value => value.includes('Dealer draft created.'), 'explicit dealer vehicle conversion saved');
    const converted = await eventually(verificationState, value => value.listing?.status === 'draft', 'assigned dealer draft persisted');
    assert.equal(converted.listing.sellerId, fixture.dealerRepresentativeUid); assert.equal(converted.user.role, 'bidder');
    assert.equal(converted.application.status, 'approved'); assert.equal(converted.listing.dealerDocFee, 0);
    assert.equal(converted.listing.taxHandling, 'requires_confirmation'); assert.equal(converted.listingAudits, 1);
    const convertedId = converted.application.convertedAuctionId;
    await command('Page.navigate', { url: origin + '/dashboard/listings/' + convertedId + '/edit?actor=admin' });
    await eventually(text, value => value.includes('Protected dealer attribution') && value.includes('Canonical Browser Dealer Inc.'), 'admin editor protects dealer attribution');
    await fill('select[aria-label="Dealer tax handling"]', 'dealer_collects', true);
    await fill('textarea[aria-label="Dealer tax change reason"]', 'Synthetic tax arrangement confirmed by curator');
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save dealer tax indicator'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    await eventually(text, value => value.includes('Dealer tax indicator saved.'), 'dedicated draft tax update saved');
    await command('Page.navigate', { url: origin + '/dashboard/listings/' + convertedId + '/edit?actor=dealer' });
    await eventually(text, value => value.includes('Assigned dealer listing') && value.includes('Overview heading'), 'bidder-role representative opens owned dealer workspace');
    await click(`(() => { const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.startsWith('Overview heading')); const field = label?.querySelector('input'); if (!field) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, 'Dealer browser narrative'); field.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save narrative'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    await eventually(text, value => value.includes('Narrative saved.'), 'assigned representative saves without role promotion');
    await click(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Submit for review'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    await eventually(verificationState, value => value.listing?.status === 'pending_review' && value.user.role === 'bidder' && value.listingAudits === 2, 'dealer submission keeps roles and audit records intact');
    await eventually(text, value => value.includes('read-only while it is under review'), 'submitted dealer draft locks representative fields');


  } catch (error) {
    console.error(serverLog);
    console.error('Browser diagnostics:', JSON.stringify(browserErrors));
    console.error('Pending request paths:', JSON.stringify([...pendingRequests.values()]));
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
