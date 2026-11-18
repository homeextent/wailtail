import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function renderPrivacyPage(policy) {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(policy.title)}</title><meta name="description" content="How Wailtail collects, uses and shares information, and how to request access, correction or deletion."><link rel="canonical" href="https://www.wailtail.com/privacy-policy/"><style>body{margin:0;background:#f7f8fa;color:#18181b;font:17px/1.7 system-ui,sans-serif}header,footer{background:#121619;color:#e4e4e7;padding:24px}nav,main,footer>div{max-width:850px;margin:auto}nav{display:flex;justify-content:space-between;gap:20px}header a,footer a{color:inherit}main{padding:48px 24px 64px}h1{font:700 clamp(2rem,6vw,3rem)/1.15 Georgia,serif}h2{font-size:1.3rem;line-height:1.4;margin-top:36px}p{overflow-wrap:anywhere}a{color:#9f2811;text-underline-offset:3px}a:focus-visible{outline:3px solid #e9ad20;outline-offset:5px}.date{color:#52525b;font-size:.9rem}@media print{header,footer{background:white;color:black}main{padding:0}}</style></head>
<body><header><nav aria-label="Privacy page navigation"><a href="/catalog">WAILTAIL</a><a href="/dealers">Dealer program</a></nav></header><main><h1>${escape(policy.title)}</h1><p class="date">Last updated: ${escape(policy.updated)}</p><p>${escape(policy.introduction)}</p>${policy.sections.map(section => `<section><h2>${escape(section.title)}</h2>${section.paragraphs.map(p => `<p>${escape(p)}</p>`).join('')}</section>`).join('')}<p><a href="mailto:${escape(policy.contactEmail)}">Contact Wailtail about privacy</a></p></main><footer><div><a href="/catalog">Return to auctions</a> · Wailtail / Homeextent Inc.</div></footer></body></html>
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const policy = JSON.parse(await readFile(new URL('../src/content/privacyPolicy.json', import.meta.url), 'utf8'));
  const output = new URL('../public/privacy-policy/index.html', import.meta.url);
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, renderPrivacyPage(policy));
}
