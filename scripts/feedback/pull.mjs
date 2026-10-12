#!/usr/bin/env node
// scripts/feedback/pull.mjs
//
// Pull the live tester feedback onto this machine so the AI coder (or a
// researcher) can analyse it without touching the database.
//
// Version 2 (the mission study, 2026-10-12) is written as a bundle:
//   <out>/feedback-v2/SUMMARY.md             start here: the numbers + how to read them
//   <out>/feedback-v2/missions.csv           one row per mission answer
//   <out>/feedback-v2/problems.csv           one row per problem report
//   <out>/feedback-v2/first-impressions.csv  one row per first impression
//   <out>/feedback-v2/wrapup.csv             SUS statements, score, prices, closing answers
//   <out>/feedback-v2/sessions.csv           one row per tester session (no IP addresses)
//   <out>/feedback-v2/raw.json               the full export, exactly as the server sent it
//   <out>/feedback-v2/screenshots/<file>     every screenshot the answers point at
//
// Version 1 (the old questionnaire) is still pulled, for history:
//   <out>/FEEDBACK-INBOX.md, <out>/FEEDBACK-INBOX.json, <out>/feedback-screenshots/
//
// <out> defaults to docs/qa/ux-testing. None of this may be committed: it holds
// tester answers and sometimes names and contact details. The default paths
// for both versions are in the root .gitignore. The feedback-v2 folder and the
// feedback-screenshots folder also carry their own .gitignore ("*"), so git
// ignores them wherever they are written. FEEDBACK-INBOX.md and .json have no
// such protection outside the default folder: keep --out-dir outside the repo.
//
// How to analyse a pull: docs/qa/ux-testing/ANALYSIS-PROTOCOL.md.
//
// Order: version 2 first, because it is the data that matters now. A version 1
// failure is reported and never stops version 2 (and the other way round).
//
// The version 2 bundle is built in a sibling folder (<out>/feedback-v2.partial)
// and only swapped in when every file is written. A failed pull leaves the
// previous bundle exactly as it was.
//
// Safety:
//   - The key travels only in the x-feedback-key header, never in a web address.
//   - Redirects are refused, so the key is never forwarded to another host.
//   - Screenshots come only through the key-protected export-screenshot route.
//   - Screenshots of sessions an admin dismissed are not downloaded.
//
// Exit codes:
//   0  everything was pulled
//   1  a part failed. The other part is still pulled. For version 2 the old
//      bundle is kept; for version 1 FEEDBACK-INBOX.md and .json are kept
//      (screenshots already downloaded may be in feedback-screenshots/).
//   2  everything was written, but some screenshots could not be downloaded
//      (they are listed on screen and in SUMMARY.md)
//
// Usage:
//   FEEDBACK_EXPORT_KEY=xxxx node scripts/feedback/pull.mjs
//   FEEDBACK_EXPORT_KEY=xxxx node scripts/feedback/pull.mjs --api https://app.onservice.ph
//   FEEDBACK_EXPORT_KEY=xxxx node scripts/feedback/pull.mjs --api http://localhost:7381 --out-dir C:\\temp\\feedback

import { existsSync } from 'node:fs';
import { writeFile, mkdir, rm, rename } from 'node:fs/promises';
import { dirname, resolve, basename, relative, isAbsolute } from 'node:path';
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
const KEY = process.env.FEEDBACK_EXPORT_KEY;

if (!KEY) {
  console.error('Missing key. Set FEEDBACK_EXPORT_KEY in the process environment.');
  process.exit(1);
}

const requestedOutDir = arg('out-dir');
const outDir = requestedOutDir
  ? resolve(requestedOutDir)
  : resolve(repoRoot, 'docs', 'qa', 'ux-testing');
const v1ShotsDir = resolve(outDir, 'feedback-screenshots');
// Fixed names, never built from a variable that could be empty.
const bundleDir = resolve(outDir, 'feedback-v2');
const partialDir = resolve(outDir, 'feedback-v2.partial');
const previousDir = resolve(outDir, 'feedback-v2.previous');
const IGNORE_ALL = '# Tester feedback: private, never commit.\n*\n';

const TIMEOUT_MS = 60_000;
const SHOT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(?:jpe?g|png|webp)$/i;

// The path as Ken would type it: relative to the repo when inside it.
function shown(path) {
  const rel = relative(repoRoot, path);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel.split('\\').join('/') : path;
}

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function reasonOf(error) {
  const cause = error && typeof error === 'object' && 'cause' in error && error.cause;
  return (cause && cause.message) || (error && error.message) || String(error);
}

async function request(path, accept) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { accept, 'x-feedback-key': KEY },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new HttpError(`GET ${path} failed: ${reasonOf(error)}`, 0);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(`GET ${path} -> ${res.status} ${res.statusText} ${body.slice(0, 200)}`.trim(), res.status);
  }
  return res;
}

// Downloads one screenshot through the key-protected route. Throws with a
// plain reason when it cannot.
async function downloadShot(name, dir) {
  const res = await request(`/api/v1/feedback/export-screenshot/${encodeURIComponent(name)}`, 'image/*');
  const type = res.headers.get('content-type') || '';
  if (!/^image\//i.test(type)) throw new Error(`the server sent "${type || 'no type'}" instead of an image`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error('the file was empty');
  await writeFile(resolve(dir, name), bytes);
}

// Windows (and OneDrive) can hold a folder for a moment after files in it are
// written or read, so a rename is retried a few times before giving up.
async function renameWithRetry(from, to) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(error?.code)) throw error;
      await new Promise(done => setTimeout(done, 200 * attempt));
    }
  }
}

// Removes one of the fixed bundle-side folders. Refuses any other path.
async function removeFixed(dir) {
  if (![partialDir, previousDir].includes(dir)) throw new Error('Refusing to delete an unexpected folder.');
  await rm(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Spreadsheet safety. Same rule as packages/api/src/utils/csv.ts
// (neutralizeCsvFormula): a cell starting with = + - @ TAB or CR gets a
// leading apostrophe so a spreadsheet shows it as text instead of running it.
// It is applied before the comma/quote/newline quoting, to every cell.
// ---------------------------------------------------------------------------
function neutralizeCsvFormula(s) {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csvCell(value) {
  let raw;
  if (value === null || value === undefined) raw = '';
  else if (Array.isArray(value)) raw = value.join('; ');
  else if (typeof value === 'object') raw = JSON.stringify(value);
  else raw = String(value);
  const s = neutralizeCsvFormula(raw);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// UTF-8 byte order mark first, so Excel shows ₱ and Tagalog/Bisaya text correctly.
function toCsv(headers, rows) {
  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// Version 1 inbox (history).
// ---------------------------------------------------------------------------

// Every screenshot URL referenced anywhere in the version 1 submissions.
function collectV1ShotUrls(json) {
  const found = new Map();
  const add = (url, where) => {
    if (typeof url === 'string' && !found.has(url)) found.set(url, where);
  };
  for (const sub of json.submissions ?? []) {
    const where = `version 1 submission ${sub.id ?? '(no id)'}`;
    const p = sub.payload ?? {};
    for (const u of p.screenshots ?? []) add(u, where);
    for (const it of p.items ?? []) {
      add(it.screenshot, where);
      for (const u of it.screenshots ?? []) add(u, where);
    }
  }
  return [...found.entries()].map(([url, where]) => ({ url, where }));
}

function v1SafeName(url) {
  const b = basename(url.split('?')[0]);
  return SHOT_NAME_RE.test(b) ? b : null;
}

async function pullV1() {
  // The digest and the JSON are separate requests. Read the JSON before and
  // after the digest; when both reads match, the digest was built from the
  // same submissions. Retry a few times if a tester submitted in between.
  const jsonPath = '/api/v1/feedback/export.json?limit=5000';
  const mdPath = '/api/v1/feedback/export.md?limit=5000';
  let before = '';
  let after = '';
  let md = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    before = await (await request(jsonPath, 'application/json')).text();
    md = await (await request(mdPath, 'text/markdown')).text();
    after = await (await request(jsonPath, 'application/json')).text();
    if (before === after) break;
  }
  let json;
  try {
    json = JSON.parse(after);
  } catch {
    throw new Error('The version 1 export was not valid JSON.');
  }

  await mkdir(v1ShotsDir, { recursive: true });
  // So git ignores the screenshots even when --out-dir points inside the repo.
  await writeFile(resolve(v1ShotsDir, '.gitignore'), IGNORE_ALL, 'utf8');

  // Longest URL first, so a relative path never rewrites part of a full one.
  const refs = collectV1ShotUrls(json).sort((a, b) => b.url.length - a.url.length);
  const failures = [];
  let downloaded = 0;
  for (const { url, where } of refs) {
    const name = v1SafeName(url);
    if (!name) {
      failures.push({ name: url, where, reason: 'not a recognised screenshot name, so it was not requested' });
      continue;
    }
    try {
      await downloadShot(name, v1ShotsDir);
      md = md.split(url).join(`feedback-screenshots/${name}`);
      downloaded += 1;
    } catch (error) {
      failures.push({ name, where, reason: reasonOf(error) });
    }
  }

  const mdPathOut = resolve(outDir, 'FEEDBACK-INBOX.md');
  const jsonPathOut = resolve(outDir, 'FEEDBACK-INBOX.json');
  await writeFile(mdPathOut, md, 'utf8');
  await writeFile(jsonPathOut, JSON.stringify(json, null, 2), 'utf8');

  console.log(`Version 1 inbox: pulled ${json.count ?? 0} submission(s); downloaded ${downloaded} screenshot(s).`);
  console.log(`  Wrote: ${shown(mdPathOut)}`);
  console.log(`  Wrote: ${shown(jsonPathOut)}`);
  if (downloaded) console.log(`  Wrote: ${shown(v1ShotsDir)} (${downloaded} image[s])`);
  if (before !== after) {
    console.warn('Warning: the version 1 inbox kept changing during the pull, so FEEDBACK-INBOX.md may differ from FEEDBACK-INBOX.json by a submission. Run the pull again to be sure.');
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Version 2 bundle.
// ---------------------------------------------------------------------------

const round1 = n => Math.round(n * 10) / 10;
const mean = values => (values.length ? values.reduce((t, v) => t + v, 0) / values.length : null);
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
const mdCell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const show = value => (value === null || value === undefined ? 'n/a' : String(value));

function answerColumns(questions) {
  return questions.map(q => `${q.key}: ${q.label}`);
}

// Answers whose key is not in the current study (an older study version).
function otherAnswers(answers, questions) {
  const known = new Set(questions.map(q => q.key));
  const extra = Object.fromEntries(Object.entries(answers ?? {}).filter(([key]) => !known.has(key)));
  return Object.keys(extra).length ? extra : null;
}

function buildBundle(data, shotStatus) {
  const study = data.study ?? {};
  const missions = study.missions ?? [];
  const missionQuestions = study.missionQuestions ?? [];
  const outcomes = study.missionOutcomes ?? [];
  const firstQuestions = study.firstImpression ?? [];
  const problemQuestions = study.problemQuestions ?? [];
  const severities = study.severities ?? [];
  const helpMethods = study.helpMethods ?? [];
  const susItems = study.sus?.items ?? [];
  const wrapupQuestions = study.wrapup ?? [];
  const priceServices = study.prices?.services ?? [];
  const pricePoints = study.prices?.points ?? [];
  const screens = study.screens ?? [];

  const sessionsById = new Map(data.sessions.map(s => [s.id, s]));
  const sessionOf = entry => sessionsById.get(entry.sessionId) ?? null;
  const isLive = entry => sessionOf(entry)?.status !== 'dismissed';
  const label = entry => sessionOf(entry)?.label ?? `Tester ${String(entry.sessionId ?? '').slice(0, 6)}`;
  const side = entry => sessionOf(entry)?.role ?? '';
  const version = entry => sessionOf(entry)?.studyVersion ?? '';
  // The app version saved with the answer itself (problem reports carry one),
  // else the one the tester gave when the session started.
  const appVersion = entry => entry.appVersion || sessionOf(entry)?.appVersion || '';
  const shotPaths = entry => (entry.screenshots ?? []).map(name => `screenshots/${name}`);
  const labelOf = (list, key) => list.find(item => item.key === key)?.label ?? key ?? '';
  const screenName = entry => screens.find(s => s.key === entry.screenKey)?.name ?? entry.screenName ?? 'Screen not given';

  const live = data.entries.filter(isLive);
  const ofKind = (list, kind) => list.filter(e => e.kind === kind);

  // missions.csv
  const missionRows = ofKind(live, 'mission').map(e => {
    const mission = missions.find(m => m.key === e.itemKey);
    return [
      e.id, label(e), side(e), e.itemKey, mission?.title ?? '', mission?.role ?? '',
      e.missionOutcome, labelOf(outcomes, e.missionOutcome), e.seq,
      ...missionQuestions.map(q => e.answers?.[q.key]),
      shotPaths(e), e.createdAt, e.updatedAt, version(e), appVersion(e), otherAnswers(e.answers, missionQuestions),
    ];
  });
  const missionsCsv = toCsv([
    'entry_id', 'tester', 'tester_side', 'mission_key', 'mission', 'mission_side',
    'outcome', 'outcome_label', 'ease_1_to_7', ...answerColumns(missionQuestions),
    'screenshots', 'created_at', 'updated_at', 'study_version', 'app_version', 'other_answers',
  ], missionRows);

  // problems.csv
  const problemRows = ofKind(live, 'problem').map(e => [
    e.id, label(e), side(e), e.createdAt, e.screenKey, screenName(e), e.screenRoute,
    e.severity, labelOf(severities, e.severity),
    ...problemQuestions.map(q => e.answers?.[q.key]),
    shotPaths(e), e.status, e.duplicateOf, e.triageNote, version(e), appVersion(e),
    otherAnswers(e.answers, problemQuestions),
  ]);
  const problemsCsv = toCsv([
    'entry_id', 'tester', 'tester_side', 'created_at', 'screen_key', 'screen', 'screen_route',
    'severity', 'severity_label', ...answerColumns(problemQuestions),
    'screenshots', 'triage_status', 'duplicate_of', 'triage_note', 'study_version', 'app_version', 'other_answers',
  ], problemRows);

  // first-impressions.csv
  const firstRows = ofKind(live, 'first_impression').map(e => [
    e.id, label(e), side(e), e.createdAt,
    ...firstQuestions.map(q => e.answers?.[q.key]),
    shotPaths(e), version(e), appVersion(e), otherAnswers(e.answers, firstQuestions),
  ]);
  const firstCsv = toCsv([
    'entry_id', 'tester', 'tester_side', 'created_at', ...answerColumns(firstQuestions),
    'screenshots', 'study_version', 'app_version', 'other_answers',
  ], firstRows);

  // wrapup.csv
  const wrapups = ofKind(live, 'wrapup');
  const priceCols = priceServices.flatMap(service => pricePoints.map(point => ({
    header: `price_${service.key}_${point.key} (PHP): ${service.name} / ${point.label}`,
    get: e => e.prices?.[service.key]?.[point.key],
  })));
  const wrapupRows = wrapups.map(e => [
    e.id, label(e), side(e), e.createdAt,
    ...susItems.map((_, i) => (Array.isArray(e.sus) ? e.sus[i] : null)), e.susScore,
    ...wrapupQuestions.map(q => e.answers?.[q.key]),
    ...priceCols.map(col => col.get(e)),
    shotPaths(e), version(e), appVersion(e), otherAnswers(e.answers, wrapupQuestions),
  ]);
  const wrapupCsv = toCsv([
    'entry_id', 'tester', 'tester_side', 'created_at',
    ...susItems.map((text, i) => `sus_${i + 1}: ${text}`), 'sus_score_0_to_100',
    ...answerColumns(wrapupQuestions),
    ...priceCols.map(col => col.header),
    'screenshots', 'study_version', 'app_version', 'other_answers',
  ], wrapupRows);

  // sessions.csv (no IP addresses: the export never contains them)
  const sessionRows = data.sessions.map(s => {
    const mine = data.entries.filter(e => e.sessionId === s.id);
    return [
      s.label, s.id, s.createdAt, s.updatedAt, s.completedAt, s.status, s.studyVersion, s.role,
      s.deviceKind, s.appSurface, s.platformDetail, s.appVersion,
      (s.helpMethods ?? []).map(key => labelOf(helpMethods, key)),
      mine.some(e => e.kind === 'first_impression') ? 'yes' : 'no',
      mine.filter(e => e.kind === 'mission').length,
      mine.filter(e => e.kind === 'problem').length,
      mine.some(e => e.kind === 'wrapup') ? 'yes' : 'no',
      s.testerName, s.testerContact,
    ];
  });
  const sessionsCsv = toCsv([
    'tester', 'session_id', 'started_at', 'last_saved_at', 'completed_at', 'status', 'study_version', 'side',
    'device', 'app_or_browser', 'platform_detail', 'app_version', 'gets_help_today',
    'first_impression', 'missions_saved', 'problems_reported', 'wrapup',
    'tester_name', 'tester_contact',
  ], sessionRows);

  // ---- SUMMARY.md ----------------------------------------------------------
  const liveSessions = data.sessions.filter(s => s.status !== 'dismissed');
  const dismissed = data.sessions.length - liveSessions.length;
  const completed = liveSessions.filter(s => s.status === 'completed').length;
  const byRole = role => liveSessions.filter(s => s.role === role).length;
  const versions = [...new Set(data.sessions.map(s => s.studyVersion).filter(Boolean))];
  const exportedAt = String(data.exportedAt ?? new Date().toISOString());

  const lines = [];
  lines.push(`# Tester feedback summary (version 2), ${exportedAt.slice(0, 10)}`);
  lines.push('');
  lines.push(`- Pulled: ${exportedAt} (UTC) from ${API}`);
  lines.push(`- Study version: ${show(study.version)}${versions.length && (versions.length > 1 || versions[0] !== study.version) ? ` (sessions answered under: ${versions.join(', ')})` : ''}`);
  lines.push(`- Testers: ${liveSessions.length} (customer ${byRole('customer')}, provider ${byRole('provider')}, both ${byRole('both')})`);
  lines.push(`- Completed the wrap-up: ${completed} of ${liveSessions.length}`);
  const appVersions = [...new Set([...liveSessions.map(s => s.appVersion), ...live.map(e => e.appVersion)].filter(Boolean))].sort();
  lines.push(`- App versions seen: ${appVersions.length ? appVersions.join(', ') : 'none given'}`);
  if (dismissed) lines.push(`- Left out: ${dismissed} session(s) an admin dismissed as junk (still listed in sessions.csv)`);
  lines.push('');

  lines.push('## Missions');
  lines.push('');
  lines.push('| Mission | Side | Answered | % done | Partly | No | Gave up | Average ease (1 to 7) |');
  lines.push('|---|---|---|---|---|---|---|---|');
  const missionEntries = ofKind(live, 'mission');
  for (const mission of missions) {
    const rows = missionEntries.filter(e => e.itemKey === mission.key);
    const count = outcome => rows.filter(e => e.missionOutcome === outcome).length;
    const seqs = rows.map(e => e.seq).filter(v => typeof v === 'number');
    const done = rows.length ? `${Math.round((count('done') / rows.length) * 100)}%` : 'n/a';
    const ease = seqs.length ? `${round1(mean(seqs))} (n=${seqs.length})` : 'n/a';
    lines.push(`| ${mdCell(mission.title)} | ${mdCell(mission.role)} | ${rows.length} | ${done} | ${count('partly')} | ${count('no')} | ${count('gave_up')} | ${ease} |`);
  }
  lines.push('');

  lines.push('## Usability score (SUS)');
  lines.push('');
  const susScores = wrapups.map(e => e.susScore).filter(v => typeof v === 'number');
  if (susScores.length) {
    lines.push(`- Average: **${round1(mean(susScores))}** out of 100 (n=${susScores.length}; lowest ${Math.min(...susScores)}, highest ${Math.max(...susScores)})`);
    for (const role of ['customer', 'provider', 'both']) {
      const scores = wrapups.filter(e => side(e) === role).map(e => e.susScore).filter(v => typeof v === 'number');
      if (scores.length) lines.push(`- ${role}: ${round1(mean(scores))} (n=${scores.length})`);
    }
  } else {
    lines.push('- No wrap-up answers yet.');
  }
  lines.push('');

  lines.push('## Problems by screen');
  lines.push('');
  const openProblems = ofKind(live, 'problem').filter(e => !['dismissed', 'duplicate'].includes(e.status));
  const groups = new Map();
  for (const e of openProblems) {
    const key = e.screenKey ?? '';
    const group = groups.get(key) ?? { name: screenName(e), reports: 0, testers: new Set(), bySeverity: {} };
    group.reports += 1;
    group.testers.add(e.sessionId);
    group.bySeverity[e.severity] = (group.bySeverity[e.severity] ?? 0) + 1;
    groups.set(key, group);
  }
  const sevKeys = severities.map(s => s.key);
  if (groups.size) {
    lines.push(`| Screen | Different testers | Reports | ${severities.map(s => mdCell(s.label)).join(' | ')} |`);
    lines.push(`|---|---|---|${sevKeys.map(() => '---').join('|')}|`);
    const sorted = [...groups.values()].sort((a, b) => b.testers.size - a.testers.size || b.reports - a.reports);
    for (const g of sorted) {
      lines.push(`| ${mdCell(g.name)} | ${g.testers.size} | ${g.reports} | ${sevKeys.map(k => g.bySeverity[k] ?? 0).join(' | ')} |`);
    }
  } else {
    lines.push('No open problem reports.');
  }
  const allProblems = ofKind(live, 'problem');
  if (allProblems.length) {
    const statuses = {};
    for (const e of allProblems) statuses[e.status] = (statuses[e.status] ?? 0) + 1;
    lines.push('');
    lines.push(`Triage status of all ${allProblems.length} report(s): ${Object.entries(statuses).map(([k, n]) => `${k} ${n}`).join(', ')}.`);
  }
  lines.push('');

  lines.push('## Fair price answers (median in PHP, with n), one row per side');
  lines.push('');
  if (wrapups.some(e => e.prices)) {
    lines.push('Worker (provider) answers are what workers think customers would pay. Read each side on its own; never average the sides together.');
    lines.push('');
    lines.push(`| Service | Side | ${pricePoints.map(p => mdCell(p.label)).join(' | ')} |`);
    lines.push(`|---|---|${pricePoints.map(() => '---').join('|')}|`);
    for (const service of priceServices) {
      let rowsForService = 0;
      for (const role of ['customer', 'provider', 'both']) {
        const answered = wrapups.filter(e => side(e) === role);
        const cells = pricePoints.map(point => {
          const values = answered.map(e => e.prices?.[service.key]?.[point.key]).filter(v => typeof v === 'number');
          return values.length ? `${median(values)} (n=${values.length})` : 'n/a';
        });
        if (cells.every(cell => cell === 'n/a')) continue;
        rowsForService += 1;
        lines.push(`| ${mdCell(service.name)} | ${role} | ${cells.join(' | ')} |`);
      }
      if (!rowsForService) lines.push(`| ${mdCell(service.name)} | no answers | ${pricePoints.map(() => 'n/a').join(' | ')} |`);
    }
  } else {
    lines.push('No price answers yet.');
  }
  lines.push('');

  lines.push('## Screenshots');
  lines.push('');
  lines.push(`- Downloaded: ${shotStatus.downloaded} of ${shotStatus.total} (in screenshots/)`);
  if (shotStatus.failed.length) {
    lines.push(`- **Could not download ${shotStatus.failed.length}:**`);
    for (const f of shotStatus.failed) lines.push(`  - ${mdCell(f.name)} (${mdCell(f.where)}): ${mdCell(f.reason)}`);
  }
  lines.push('');

  lines.push('## Files in this folder');
  lines.push('');
  lines.push('- missions.csv: one row per mission answer (outcome, ease 1 to 7, why, what they expected, what they would change).');
  lines.push('- problems.csv: one row per problem report (screen, how bad, trying / happened / expected, triage status).');
  lines.push('- first-impressions.csv: what testers thought the app was for before tapping anything.');
  lines.push('- wrapup.csv: the 10 SUS statements (1 = strongly disagree, 5 = strongly agree), the score, the closing answers and the price answers.');
  lines.push('- sessions.csv: one row per tester session, including dismissed ones. May hold names and contact details.');
  lines.push('- raw.json: the full export as the server sent it.');
  lines.push('- screenshots/: every screenshot from the sessions that were not dismissed. The "screenshots" column in each spreadsheet points here.');
  lines.push('');

  lines.push('## How to read this');
  lines.push('');
  lines.push('- These numbers are counted from the rows in this folder, so they match the spreadsheets. The admin page may differ slightly if testers saved more after this pull.');
  lines.push('- Sessions an admin dismissed as junk are left out of every number and every spreadsheet except sessions.csv.');
  lines.push('- "% done" counts only "Yes, I did it". "Partly" is not counted as done.');
  lines.push('- Average ease is the Single Ease Question: 1 is very difficult, 7 is very easy. Around 5.5 is typical; a mission below 5 needs a look.');
  lines.push('- SUS is 0 to 100. About 68 is average for apps and websites, under 50 means serious problems, over 80 is good.');
  lines.push('- For problems, the number of different testers matters more than the number of reports. One tester reporting the same thing five times is still one tester.');
  lines.push('- Reports an admin marked duplicate or dismissed are left out of the screen table, but are still in problems.csv.');
  lines.push('- With fewer than 5 testers behind a number, treat it as a hint, not a fact.');
  lines.push('- Labels and question wording come from the study version shown above. If sessions answered an older version, check raw.json for what they saw.');
  lines.push('- In the spreadsheets, a cell that starts with = + - or @ gets a leading apostrophe so the spreadsheet shows it as text. The apostrophe is not part of what the tester typed.');
  lines.push('- Next step: follow docs/qa/ux-testing/ANALYSIS-PROTOCOL.md and write the dated insights file.');
  lines.push('- Never commit this folder. It holds tester answers and sometimes names and contact details.');
  lines.push('');

  return {
    'SUMMARY.md': lines.join('\n'),
    'missions.csv': missionsCsv,
    'problems.csv': problemsCsv,
    'first-impressions.csv': firstCsv,
    'wrapup.csv': wrapupCsv,
    'sessions.csv': sessionsCsv,
    'raw.json': JSON.stringify(data, null, 2),
  };
}


// Puts the finished partial folder in place of the old bundle. The old bundle
// is moved aside first and deleted only once the new one is in place.
async function swapInBundle() {
  const hadOld = existsSync(bundleDir);
  if (hadOld) {
    await removeFixed(previousDir);
    try {
      await renameWithRetry(bundleDir, previousDir);
    } catch (error) {
      throw new Error(`Could not move the old bundle aside (${reasonOf(error)}). Close any file open from ${shown(bundleDir)} and run the pull again. The old bundle is unchanged; the new one is in ${shown(partialDir)}.`, { cause: error });
    }
  }
  try {
    await renameWithRetry(partialDir, bundleDir);
  } catch (error) {
    let kept = 'there was no old bundle';
    if (hadOld) {
      kept = await renameWithRetry(previousDir, bundleDir)
        .then(() => `the old bundle is back in ${shown(bundleDir)}`)
        .catch(() => `the old bundle is in ${shown(previousDir)}`);
    }
    throw new Error(`Could not put the new bundle in place (${reasonOf(error)}). The new one is in ${shown(partialDir)}; ${kept}.`, { cause: error });
  }
  if (hadOld) {
    await removeFixed(previousDir).catch(error => {
      console.warn(`Warning: could not delete ${shown(previousDir)} (${reasonOf(error)}). It is the previous bundle; delete it by hand.`);
    });
  }
}

async function pullV2() {
  // A run that stopped between the two renames in swapInBundle left the old
  // bundle in the ".previous" folder. Put it back first, even if this pull
  // then fails at the network step.
  if (!existsSync(bundleDir) && existsSync(previousDir)) await renameWithRetry(previousDir, bundleDir);

  // One request: every file in the bundle is built from this single response.
  const res = await request('/api/v1/feedback/v2/export.json', 'application/json');
  let body;
  try {
    body = JSON.parse(await res.text());
  } catch {
    throw new Error('The version 2 export was not valid JSON.');
  }
  const data = body && body.data;
  if (!data || typeof data !== 'object' || !data.study || !Array.isArray(data.sessions) || !Array.isArray(data.entries)) {
    throw new Error('The version 2 export did not have the expected shape (study, sessions, entries).');
  }

  // Build the new bundle beside the old one. A fresh folder each time, so
  // screenshots deleted on the server do not linger.
  await removeFixed(partialDir);
  const shotsDir = resolve(partialDir, 'screenshots');
  const failures = [];
  let shotStatus;
  try {
    await mkdir(shotsDir, { recursive: true });
    // Written first: git ignores this folder (and the .gitignore itself) wherever it lives.
    await writeFile(resolve(partialDir, '.gitignore'), IGNORE_ALL, 'utf8');

    // Screenshots of dismissed (junk) sessions are not downloaded: no
    // spreadsheet row points at them, and they may hold anything.
    const dismissed = new Set(data.sessions.filter(s => s?.status === 'dismissed').map(s => s.id));
    const wanted = new Map();
    for (const entry of data.entries) {
      if (dismissed.has(entry.sessionId)) continue;
      for (const name of entry.screenshots ?? []) {
        if (!wanted.has(name)) wanted.set(name, `${entry.kind} ${String(entry.id ?? '').slice(0, 8)}`);
      }
    }
    shotStatus = { total: wanted.size, downloaded: 0, failed: [] };
    for (const [name, where] of wanted) {
      const record = reason => {
        const failure = { name: String(name), where: `version 2 ${where}`, reason };
        shotStatus.failed.push(failure);
        failures.push(failure);
      };
      if (typeof name !== 'string' || !SHOT_NAME_RE.test(name)) {
        record('not a recognised screenshot name, so it was not requested');
        continue;
      }
      try {
        await downloadShot(name, shotsDir);
        shotStatus.downloaded += 1;
      } catch (error) {
        record(reasonOf(error));
      }
    }

    const files = buildBundle(data, shotStatus);
    for (const [file, content] of Object.entries(files)) {
      await writeFile(resolve(partialDir, file), content, 'utf8');
    }
  } catch (error) {
    await removeFixed(partialDir).catch(() => {});
    throw error;
  }

  await swapInBundle();

  const liveSessions = data.sessions.filter(s => s.status !== 'dismissed');
  console.log(`Version 2 bundle: ${liveSessions.length} tester(s), ${liveSessions.filter(s => s.status === 'completed').length} completed; downloaded ${shotStatus.downloaded} of ${shotStatus.total} screenshot(s).`);
  console.log(`  Wrote: ${shown(bundleDir)} (start with ${shown(resolve(bundleDir, 'SUMMARY.md'))})`);
  return failures;
}

// Runs one part. A route the server does not have (404) is reported and
// skipped, so this script works against a server that has only one of the two
// versions. Any other failure is reported and the next part still runs.
async function runPart(label, run, state) {
  try {
    state.failures.push(...await run());
    return 'pulled';
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      console.log(`${label}: this server does not have it (404), skipped.`);
      return 'missing';
    }
    console.error(`${label} failed: ${reasonOf(error)}`);
    state.failedParts.push(label);
    return 'failed';
  }
}

try {
  await mkdir(outDir, { recursive: true });
  const state = { failures: [], failedParts: [] };
  // Version 2 first: it is the data that matters. Version 1 is history.
  const v2 = await runPart('Version 2 bundle', pullV2, state);
  const v1 = await runPart('Version 1 inbox', pullV1, state);
  if (state.failures.length) {
    console.error(`${state.failures.length} screenshot(s) could not be downloaded:`);
    for (const f of state.failures) console.error(`  ${f.name} (${f.where}): ${f.reason}`);
    console.error('Everything else was written. Run the pull again later, or check the files on the server.');
    process.exitCode = 2;
  }
  if (state.failedParts.length) {
    const kept = v2 === 'pulled' ? ' The version 2 bundle was still written in full.' : '';
    throw new Error(`${state.failedParts.join(' and ')} (see above).${kept}`);
  }
  if (v1 === 'missing' && v2 === 'missing') throw new Error(`Neither export was found at ${API}. Check --api.`);
} catch (err) {
  console.error('Pull failed:', err.message);
  process.exitCode = 1;
}
// process.exitCode, not process.exit(): exiting while network sockets are
// still closing crashes Node on Windows (exit code 3221226505).
