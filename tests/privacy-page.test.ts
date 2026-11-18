import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { renderPrivacyPage } from '../scripts/generate-privacy-page.mjs';

const policy = JSON.parse(await readFile(new URL('../src/content/privacyPolicy.json', import.meta.url), 'utf8'));

test('privacy page contains policy text without JavaScript and matches the shared source', async () => {
  const html = await readFile(new URL('../public/privacy-policy/index.html', import.meta.url), 'utf8');
  assert.equal(html, renderPrivacyPage(policy));
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<h1>Wailtail Privacy Policy<\/h1>/);
  assert.match(html, /mailto:contact@wailtail.com/);
  assert.match(html, /deletion of your personal information/);
  assert.doesNotMatch(html, /<script|noindex|login required/i);
  for (const section of policy.sections) assert.ok(html.includes(section.title));
});

test('static policy escapes source text and never treats it as markup', () => {
  const html = renderPrivacyPage({ ...policy, introduction: '<script>alert("test")</script>' });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script/);
});

test('privacy routes precede and are excluded from auction SPA fallback', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const route of ['/privacy-policy', '/privacy-policy/']) {
    const index = config.rewrites.findIndex(rule => rule.source === route);
    assert.ok(index >= 0 && index < config.rewrites.length - 1);
    assert.equal(config.rewrites[index].destination, '/privacy-policy/index.html');
  }
  assert.ok(config.rewrites.at(-1).source.includes('privacy-policy'));
  const vite = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(vite, /navigateFallbackDenylist: \[\/\^\\\/privacy-policy/);
});
