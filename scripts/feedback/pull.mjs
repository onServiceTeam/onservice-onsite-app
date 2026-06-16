#!/usr/bin/env node
// scripts/feedback/pull.mjs
//
// Pull the live UX-tester feedback into the repo so the AI coder (and a human)
// can read, interpret, and act on it without touching the database. Writes:
//   docs/qa/ux-testing/FEEDBACK-INBOX.md       (readable digest, newest first)
//   docs/qa/ux-testing/FEEDBACK-INBOX.json      (machine readable)
//   docs/qa/ux-testing/feedback-screenshots/    (downloaded tester screenshots)
//
// The screenshots are downloaded locally and the digest is rewritten to point at
// those local files, so the AI coder can OPEN each image with its vision and see
// the actual broken screen a tester reported, then fix it. See AI-CODER-REVIEW.md.
//
// All three outputs are gitignored (live data + tester PII) and regenerated on
// demand. Do NOT commit them.
//
// Usage:
//   FEEDBACK_EXPORT_KEY=xxxx node scripts/feedback/pull.mjs
//   node scripts/feedback/pull.mjs --key xxxx --api https://app.onservice.ph

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Default to the app vhost: api.onservice.ph is IP-locked to Ken's test network
// (allow <ip>; deny all), but app.onservice.ph proxies /api/ ungated, so the
// key-protected export is reachable from anywhere. Override with --api if needed.
const API = (arg('api') || process.env.FEEDBACK_API || 'https://app.onservice.ph').replace(/\/$/, '');
const KEY = arg('key') || process.env.FEEDBACK_EXPORT_KEY;

if (!KEY) {
  console.error('Missing key. Set FEEDBACK_EXPORT_KEY or pass --key <value>.');
  process.exit(1);
}

const outDir = resolve(repoRoot, 'docs', 'qa', 'ux-testing');
const shotsDir = resolve(outDir, 'feedback-screenshots');

async function get(path, accept) {
  const url = `${API}/api/v1/feedback/${path}?key=${encodeURIComponent(KEY)}&limit=5000`;
  const res = await fetch(url, { headers: { accept } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${path} -> ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  }
  return res;
}

// Collect every screenshot URL referenced anywhere in the submissions.
function collectShotUrls(json) {
  const urls = new Set();
  for (const sub of json.submissions ?? []) {
    const p = sub.payload ?? {};
    for (const u of p.screenshots ?? []) if (typeof u === 'string') urls.add(u);
    for (const it of p.items ?? []) {
      for (const u of it.screenshots ?? []) if (typeof u === 'string') urls.add(u);
    }
  }
  return [...urls];
}

function safeName(url) {
  const b = basename(url.split('?')[0]);
  return b.replace(/[^A-Za-z0-9._-]/g, '_') || 'shot';
}

try {
  const [mdRes, jsonRes] = await Promise.all([
    get('export.md', 'text/markdown'),
    get('export.json', 'application/json'),
  ]);
  let md = await mdRes.text();
  const json = await jsonRes.json();

  await mkdir(shotsDir, { recursive: true });

  // Download each screenshot and rewrite the digest to the local path so the AI
  // coder can open the image directly.
  const shotUrls = collectShotUrls(json);
  let downloaded = 0;
  for (const url of shotUrls) {
    try {
      const abs = url.startsWith('http') ? url : `${API}${url}`;
      const r = await fetch(abs);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const name = safeName(url);
      await writeFile(resolve(shotsDir, name), buf);
      md = md.split(url).join(`feedback-screenshots/${name}`);
      downloaded += 1;
    } catch {
      // leave the remote URL in the digest if a download fails
    }
  }

  await writeFile(resolve(outDir, 'FEEDBACK-INBOX.md'), md, 'utf8');
  await writeFile(resolve(outDir, 'FEEDBACK-INBOX.json'), JSON.stringify(json, null, 2), 'utf8');

  console.log(`Pulled ${json.count ?? 0} submission(s); downloaded ${downloaded} screenshot(s).`);
  console.log(`Wrote: docs/qa/ux-testing/FEEDBACK-INBOX.md`);
  console.log(`Wrote: docs/qa/ux-testing/FEEDBACK-INBOX.json`);
  if (downloaded) console.log(`Wrote: docs/qa/ux-testing/feedback-screenshots/ (${downloaded} image[s])`);
} catch (err) {
  console.error('Pull failed:', err.message);
  process.exit(1);
}
