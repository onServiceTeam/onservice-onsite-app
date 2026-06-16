#!/usr/bin/env node
// scripts/feedback/pull.mjs
//
// Pull the live UX-tester feedback into the repo so the AI coder (and a human)
// can read it without touching the database. Writes:
//   docs/qa/ux-testing/FEEDBACK-INBOX.md   (human + AI readable digest)
//   docs/qa/ux-testing/FEEDBACK-INBOX.json (machine readable, for processing)
//
// Usage:
//   FEEDBACK_EXPORT_KEY=xxxx node scripts/feedback/pull.mjs
//   node scripts/feedback/pull.mjs --key xxxx --api https://api.onservice.ph
//
// The key is the FEEDBACK_EXPORT_KEY set in the API env on the server. Ken keeps
// it; the AI coder is given it when asked to review feedback. Do NOT commit the
// key. The generated INBOX files are safe to commit (review material, optional
// names/contacts only).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const API = (arg('api') || process.env.FEEDBACK_API || 'https://api.onservice.ph').replace(/\/$/, '');
const KEY = arg('key') || process.env.FEEDBACK_EXPORT_KEY;

if (!KEY) {
  console.error('Missing key. Set FEEDBACK_EXPORT_KEY or pass --key <value>.');
  process.exit(1);
}

const outDir = resolve(repoRoot, 'docs', 'qa', 'ux-testing');

async function get(path, accept) {
  const url = `${API}/api/v1/feedback/${path}?key=${encodeURIComponent(KEY)}&limit=5000`;
  const res = await fetch(url, { headers: { accept } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${path} -> ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  }
  return res;
}

try {
  const [mdRes, jsonRes] = await Promise.all([
    get('export.md', 'text/markdown'),
    get('export.json', 'application/json'),
  ]);
  const md = await mdRes.text();
  const json = await jsonRes.json();

  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'FEEDBACK-INBOX.md'), md, 'utf8');
  await writeFile(resolve(outDir, 'FEEDBACK-INBOX.json'), JSON.stringify(json, null, 2), 'utf8');

  console.log(`Pulled ${json.count ?? 0} submission(s).`);
  console.log(`Wrote: docs/qa/ux-testing/FEEDBACK-INBOX.md`);
  console.log(`Wrote: docs/qa/ux-testing/FEEDBACK-INBOX.json`);
} catch (err) {
  console.error('Pull failed:', err.message);
  process.exit(1);
}
