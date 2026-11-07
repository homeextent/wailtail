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

test('signed-out catalog and lot render, and administrator inventory renders under candidate rules', { timeout: 150_000 }, async () => {
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
    await eventually(text, value => value.includes('Synthetic public overview') &&
      value.includes('Synthetic public description'), 'public auction detail');
    const publicResponse = await fetch(origin + `/api/public-auctions?auctionId=${fixture.publicAuctionId}`);
    const publicData = await publicResponse.json();
    assert.equal(publicData.auction.reserveAmount, undefined);
    assert.equal(publicData.auction.sellerEmail, undefined);
    await command('Page.navigate', { url: origin + '/admin?tab=inventory' });
    await eventually(text, value => value.includes('Synthetic browser listing'), 'administrator inventory');
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
    await rm(profile, { recursive: true, force: true });
  }
});
