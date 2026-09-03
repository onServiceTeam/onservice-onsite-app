// packages/api/src/services/feedback.service.ts
//
// UX tester feedback. Submissions come from the public /feedback web page and
// land in the feedback_submissions table. The dev/design team and the AI coder
// read them back through the key-protected export endpoints (JSON / Markdown /
// CSV) or by pulling them into the repo with scripts/feedback/pull.mjs.
//
// The validate/normalize and the markdown/csv formatters are pure functions so
// they can be unit-tested without a database.

import { pool } from '../config/database.config';
import { neutralizeCsvFormula } from '../utils/csv';

const MAX = {
  name: 200,
  contact: 200,
  shortText: 2_000,
  longText: 10_000,
  items: 50,
  itemField: 3_000,
  ratings: 60,
  // Free-text answers get their own (much higher) cap. The feedback page already
  // ships 65+ answer fields and is growing; reusing the 60 ratings cap silently
  // dropped the overflow (cleanRecord stops at maxKeys). 200 leaves generous room
  // so no tester answer is ever discarded.
  answers: 200,
  prices: 30,
};

const AREAS = ['customer', 'provider', 'admin'] as const;
const ITEM_TYPES = ['bug', 'friction', 'idea', 'service idea', 'price idea', 'praise'] as const;
const SEVERITIES = ['blocker', 'major', 'minor', 'idea', 'praise'] as const;

export interface FeedbackItem {
  area: string;
  type: string;
  severity: string;
  where: string;
  what: string;
  expected: string;
  repro: string;
  screenshot: string;
  screenshots: string[];
}

// Screenshot URLs must point at our own feedback uploads (set by the upload
// endpoint), never an arbitrary or javascript: URL — those get rendered as
// links in the admin/inbox, so we whitelist the shape rather than trust input.
// Only a relative /uploads/feedback/<file> or an onservice.ph-hosted one passes;
// an external host (e.g. evil.com/uploads/feedback/x) is rejected.
const SHOT_RE = /^(https?:\/\/([a-z0-9-]+\.)*onservice\.ph)?\/uploads\/feedback\/[A-Za-z0-9._-]+$/i;

function cleanShots(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const s of v) {
    const u = String(s).trim().slice(0, 500);
    if (SHOT_RE.test(u)) out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

export interface NormalizedFeedback {
  testerName: string | null;
  testerContact: string | null;
  role: string | null;
  device: string | null;
  areas: string[];
  nps: number | null;
  summary: string | null;
  itemCount: number;
  payload: Record<string, unknown>;
}

export interface FeedbackRow extends NormalizedFeedback {
  id: string;
  createdAt: string;
  status: string;
}

type ValidateResult =
  | { ok: true; spam: false; value: NormalizedFeedback }
  | { ok: false; spam: true } // honeypot tripped — caller should fake success
  | { ok: false; spam: false; reason: string };

function str(v: unknown, cap: number): string {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, cap);
}

function textLimitError(value: unknown, cap: number, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (String(value).trim().length <= cap) return null;
  return `${label} must be ${cap.toLocaleString('en-US')} characters or fewer.`;
}

function recordLimitError(
  value: unknown,
  maxKeys: number,
  valueCap: number,
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    return `${label} must be submitted as named fields.`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > maxKeys) {
    return `${label} can contain at most ${maxKeys} fields.`;
  }
  for (const [key, fieldValue] of entries) {
    if (String(key).trim().length > 80) {
      return `${label} contains a field name longer than 80 characters.`;
    }
    const error = textLimitError(fieldValue, valueCap, `${label} field “${String(key).trim() || 'unnamed'}”`);
    if (error) return error;
  }
  return null;
}

function screenshotLimitError(value: unknown, max: number, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return `${label} must be submitted as a list.`;
  if (value.length > max) return `${label} can contain at most ${max} images.`;
  for (const entry of value) {
    const error = textLimitError(entry, 500, `${label} storage identifier`);
    if (error) return error;
  }
  return null;
}

function submissionLimitError(body: Record<string, unknown>): string | null {
  const scalarLimits: Array<[unknown, number, string]> = [
    [body.testerName, MAX.name, 'Tester name'],
    [body.testerContact, MAX.contact, 'Tester contact'],
    [body.role, 40, 'Tester role'],
    [body.device, 120, 'Device'],
    [body.nps, 5, 'Recommendation score'],
    [body.ideas, MAX.longText, 'Additional ideas'],
  ];
  for (const [value, cap, label] of scalarLimits) {
    const error = textLimitError(value, cap, label);
    if (error) return error;
  }

  if (body.areas !== null && body.areas !== undefined) {
    if (!Array.isArray(body.areas)) return 'Tested areas must be submitted as a list.';
    if (body.areas.length > AREAS.length) return `Tested areas can contain at most ${AREAS.length} entries.`;
    for (const area of body.areas) {
      const error = textLimitError(area, 40, 'Tested area');
      if (error) return error;
    }
  }

  const recordLimits: Array<[unknown, number, number, string]> = [
    [body.ratings, MAX.ratings, 10, 'Ratings'],
    [body.answers, MAX.answers, MAX.shortText, 'Answers'],
    [body.prices, MAX.prices, 40, 'Price feedback'],
  ];
  for (const [value, maxKeys, valueCap, label] of recordLimits) {
    const error = recordLimitError(value, maxKeys, valueCap, label);
    if (error) return error;
  }

  const topLevelScreenshotError = screenshotLimitError(body.screenshots, 20, 'General screenshots');
  if (topLevelScreenshotError) return topLevelScreenshotError;

  if (body.items !== null && body.items !== undefined) {
    if (!Array.isArray(body.items)) return 'Issue details must be submitted as a list.';
    if (body.items.length > MAX.items) return `Issue details can contain at most ${MAX.items} items.`;
    for (let index = 0; index < body.items.length; index += 1) {
      const item = body.items[index];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return `Issue ${index + 1} must be submitted as named fields.`;
      }
      const typed = item as Record<string, unknown>;
      const itemLimits: Array<[unknown, number, string]> = [
        [typed.area, 40, `Issue ${index + 1} area`],
        [typed.type, 40, `Issue ${index + 1} type`],
        [typed.severity, 40, `Issue ${index + 1} severity`],
        [typed.where, MAX.itemField, `Issue ${index + 1} screen`],
        [typed.what, MAX.itemField, `Issue ${index + 1} description`],
        [typed.expected, MAX.itemField, `Issue ${index + 1} expected result`],
        [typed.repro, MAX.itemField, `Issue ${index + 1} reproduction steps`],
        [typed.screenshot, 500, `Issue ${index + 1} screenshot note`],
      ];
      for (const [value, cap, label] of itemLimits) {
        const error = textLimitError(value, cap, label);
        if (error) return error;
      }
      const screenshotError = screenshotLimitError(typed.screenshots, 10, `Issue ${index + 1} screenshots`);
      if (screenshotError) return screenshotError;
    }
  }

  return null;
}

function cleanRecord(v: unknown, maxKeys: number, valueCap: number): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (n >= maxKeys) break;
    const key = String(k).trim().slice(0, 80);
    if (!key) continue;
    out[key] = str(val, valueCap);
    n += 1;
  }
  return out;
}

/**
 * Validate and normalize a raw submission body from the feedback page.
 * Pure (no DB). Enforces the honeypot, length caps, and value whitelists so a
 * bot or a malformed post can't flood or break the store.
 */
export function validateAndNormalize(body: unknown): ValidateResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, spam: false, reason: 'Empty submission.' };
  }
  const b = body as Record<string, unknown>;

  // Honeypot — a hidden field real humans never fill. If it has anything, it's
  // a bot. Don't store it, but tell the caller to return success so the bot
  // gets no signal.
  if (str(b._hp ?? b.website ?? '', 100).length > 0) {
    return { ok: false, spam: true };
  }

  // Reject overflow explicitly. Silently slicing a tester's words creates a
  // plausible-looking but incomplete research record and allowed the original
  // stress submission to pollute the queue. The browser exposes the same caps,
  // while this server check remains authoritative for direct requests.
  const limitError = submissionLimitError(b);
  if (limitError) {
    return { ok: false, spam: false, reason: limitError };
  }

  const testerName = str(b.testerName, MAX.name) || null;
  const testerContact = str(b.testerContact, MAX.contact) || null;
  const role = str(b.role, 40).toLowerCase() || null;
  const device = str(b.device, 120) || null;

  const areas = Array.isArray(b.areas)
    ? [...new Set((b.areas as unknown[])
        .map((a) => str(a, 40).toLowerCase())
        .filter((a): a is (typeof AREAS)[number] => (AREAS as readonly string[]).includes(a)))]
    : [];

  let nps: number | null = null;
  if (b.nps !== undefined && b.nps !== null && str(b.nps, 5) !== '') {
    const n = Math.round(Number(b.nps));
    nps = Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : null;
  }

  const ratings = cleanRecord(b.ratings, MAX.ratings, 10);
  const answers = cleanRecord(b.answers, MAX.answers, MAX.shortText);
  const prices = cleanRecord(b.prices, MAX.prices, 40);
  const ideas = str(b.ideas, MAX.longText);
  const screenshots = cleanShots(b.screenshots, 20);

  const rawItems = Array.isArray(b.items) ? (b.items as unknown[]).slice(0, MAX.items) : [];
  const items: FeedbackItem[] = rawItems
    .map((it) => {
      const o = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
      const type = str(o.type, 40).toLowerCase();
      const severity = str(o.severity, 40).toLowerCase();
      return {
        area: str(o.area, 40).toLowerCase(),
        type: (ITEM_TYPES as readonly string[]).includes(type) ? type : (type || 'other'),
        severity: (SEVERITIES as readonly string[]).includes(severity) ? severity : (severity || ''),
        where: str(o.where, MAX.itemField),
        what: str(o.what, MAX.itemField),
        expected: str(o.expected, MAX.itemField),
        repro: str(o.repro, MAX.itemField),
        screenshot: str(o.screenshot, 500),
        screenshots: cleanShots(o.screenshots, 10),
      };
    })
    // Drop fully-empty item rows the form may submit.
    .filter((it) => it.what || it.where || it.expected || it.repro || it.screenshot || it.screenshots.length);

  // Require at least *something*: a rating, an answer, an idea, an item, or an
  // NPS. An entirely empty form is almost certainly a misfire or a bot.
  const hasContent =
    Object.keys(ratings).length > 0 ||
    Object.values(answers).some((v) => v) ||
    Object.values(prices).some((v) => v) ||
    ideas.length > 0 ||
    items.length > 0 ||
    screenshots.length > 0 ||
    nps !== null;
  if (!hasContent) {
    return { ok: false, spam: false, reason: 'Please answer at least one question before submitting.' };
  }

  const summary = deriveSummary({ items, answers, ideas });

  const payload: Record<string, unknown> = { ratings, answers, prices, ideas, items, screenshots };

  return {
    ok: true,
    spam: false,
    value: { testerName, testerContact, role, device, areas, nps, summary, itemCount: items.length, payload },
  };
}

function deriveSummary(parts: { items: FeedbackItem[]; answers: Record<string, string>; ideas: string }): string | null {
  const firstBlocker = parts.items.find((i) => i.severity === 'blocker' || i.severity === 'major');
  if (firstBlocker?.what) return clip(`${firstBlocker.severity || firstBlocker.type}: ${firstBlocker.what}`);
  const firstItem = parts.items.find((i) => i.what);
  if (firstItem?.what) return clip(`${firstItem.type}: ${firstItem.what}`);
  const firstAnswer = Object.values(parts.answers).find((v) => v && v.length > 3);
  if (firstAnswer) return clip(firstAnswer);
  if (parts.ideas) return clip(parts.ideas);
  return null;
}

function clip(s: string, n = 160): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// ── DB ──────────────────────────────────────────────────────────────────────

export async function createFeedback(
  v: NormalizedFeedback,
  meta: { userAgent: string | null; ip: string | null },
): Promise<{ id: string; createdAt: string }> {
  const { rows } = await pool.query(
    `INSERT INTO feedback_submissions
       (tester_name, tester_contact, role, device, areas, nps, summary, item_count, payload, user_agent, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
     RETURNING id, created_at`,
    [
      v.testerName,
      v.testerContact,
      v.role,
      v.device,
      v.areas,
      v.nps,
      v.summary,
      v.itemCount,
      JSON.stringify(v.payload),
      meta.userAgent,
      meta.ip,
    ],
  );
  return { id: rows[0].id, createdAt: rows[0].created_at };
}

export async function listFeedback(limit = 1000): Promise<FeedbackRow[]> {
  const { rows } = await pool.query(
    `SELECT id, created_at, tester_name, tester_contact, role, device, areas, nps,
            summary, item_count, payload, status
       FROM feedback_submissions
      ORDER BY created_at DESC
      LIMIT $1`,
    [Math.min(5000, Math.max(1, limit))],
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    testerName: r.tester_name,
    testerContact: r.tester_contact,
    role: r.role,
    device: r.device,
    areas: r.areas ?? [],
    nps: r.nps,
    summary: r.summary,
    itemCount: r.item_count,
    payload: r.payload ?? {},
    status: r.status,
  }));
}

// ── Exports (pure formatters) ────────────────────────────────────────────────

export function toMarkdown(rows: FeedbackRow[]): string {
  const lines: string[] = [];
  lines.push('# onService — Tester Feedback Inbox');
  lines.push('');
  lines.push(`Total submissions: **${rows.length}**. Newest first.`);
  lines.push('');
  lines.push(
    'This file is generated from the live feedback database. The AI coder and the ' +
      'human team both read it. Each bug in the items list is written to be picked up ' +
      'cold — area, where, what, expected. See INTAKE-TRIAGE.md for how to turn these ' +
      'into tasks.',
  );
  lines.push('');

  if (rows.length === 0) {
    lines.push('_No submissions yet._');
    return lines.join('\n');
  }

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (!r) continue;
    const p = (r.payload ?? {}) as {
      ratings?: Record<string, string>;
      answers?: Record<string, string>;
      prices?: Record<string, string>;
      ideas?: string;
      items?: FeedbackItem[];
      screenshots?: string[];
    };
    lines.push('---');
    lines.push('');
    lines.push(`## #${rows.length - i} — ${r.summary ?? '(no summary)'}`);
    lines.push('');
    lines.push(`- When: ${r.createdAt}`);
    lines.push(`- Tester: ${r.testerName ?? 'anonymous'}${r.testerContact ? ` (${r.testerContact})` : ''}`);
    lines.push(`- Areas: ${r.areas.length ? r.areas.join(', ') : '—'}  | Role: ${r.role ?? '—'}  | Device: ${r.device ?? '—'}`);
    lines.push(`- Recommend (NPS): ${r.nps ?? '—'} / 10  | Items: ${r.itemCount}  | Status: ${r.status}`);
    lines.push('');

    const ratings = p.ratings ?? {};
    if (Object.keys(ratings).length) {
      lines.push('**Ratings (1-5):** ' + Object.entries(ratings).map(([k, v]) => `${k}=${v}`).join(', '));
      lines.push('');
    }

    const answers = p.answers ?? {};
    const answered = Object.entries(answers).filter(([, v]) => v && v.trim());
    if (answered.length) {
      lines.push('**Answers:**');
      for (const [k, v] of answered) lines.push(`- _${k}_: ${v}`);
      lines.push('');
    }

    const prices = p.prices ?? {};
    const pricedEntries = Object.entries(prices).filter(([, v]) => v && v.trim());
    if (pricedEntries.length) {
      lines.push('**Prices:** ' + pricedEntries.map(([k, v]) => `${k}=${v}`).join(', '));
      lines.push('');
    }

    if (p.ideas && p.ideas.trim()) {
      lines.push('**Ideas:**');
      lines.push('> ' + p.ideas.replace(/\n/g, '\n> '));
      lines.push('');
    }

    const shots = Array.isArray(p.screenshots) ? p.screenshots : [];
    if (shots.length) {
      lines.push('**Screenshots:**');
      for (const url of shots) lines.push(`- ![screenshot](${url})`);
      lines.push('');
    }

    const items = Array.isArray(p.items) ? p.items : [];
    if (items.length) {
      lines.push('**Logged items:**');
      for (let j = 0; j < items.length; j += 1) {
        const it = items[j];
        if (!it) continue;
        const tag = [it.severity, it.type, it.area].filter(Boolean).join(' / ');
        lines.push(`- **[${tag || 'item'}]** ${it.what || '(no description)'}`);
        if (it.where) lines.push(`    - Where: ${it.where}`);
        if (it.expected) lines.push(`    - Expected: ${it.expected}`);
        if (it.repro) lines.push(`    - To reproduce: ${it.repro}`);
        if (it.screenshot) lines.push(`    - Screenshot (note): ${it.screenshot}`);
        if (Array.isArray(it.screenshots)) {
          for (const url of it.screenshots) lines.push(`    - Screenshot: ${url}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function toCsv(rows: FeedbackRow[]): string {
  const headers = [
    'id', 'created_at', 'tester_name', 'role', 'device', 'areas', 'nps', 'item_count', 'status', 'summary', 'ideas',
  ];
  const esc = (v: unknown): string => {
    // Neutralize formula triggers before the comma/quote/newline quoting.
    const s = neutralizeCsvFormula(v === null || v === undefined ? '' : String(v));
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [headers.join(',')];
  for (const r of rows) {
    const ideas = (r.payload as { ideas?: string })?.ideas ?? '';
    out.push(
      [
        r.id,
        r.createdAt,
        r.testerName ?? '',
        r.role ?? '',
        r.device ?? '',
        r.areas.join('|'),
        r.nps ?? '',
        r.itemCount,
        r.status,
        r.summary ?? '',
        ideas,
      ]
        .map(esc)
        .join(','),
    );
  }
  return out.join('\n');
}
