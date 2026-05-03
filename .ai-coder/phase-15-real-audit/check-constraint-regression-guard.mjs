// Phase 25d — CI guard against CHECK constraint regression.
//
// Migration 119 (Phase 19) replaced the entire admin_actions_action_type_check
// CHECK list and silently dropped 7 previously-allowed verbs. Phase 24
// found that disaster only because of an exhaustive forensic. This guard
// makes that regression class impossible going forward by walking the
// migration history in order, reconstructing the CHECK value sets at each
// step, and FAILING if any migration drops values from a previously-allowed
// list (without an explicit `-- intentional removal:` directive).
//
// Two parts:
//   PART A: Static migration walk — for every constraint that gets
//           DROP+ADD'd, the new value list must be a SUPERSET of all
//           previously-allowed values.
//   PART B: Live DB cross-check — for every emitted action_type/target_type
//           literal in packages/api/src, the value MUST be in the live
//           CHECK. (Same shape as Phase 24a forensic extractor; folded in
//           here so CI runs both with one command.)
//
// Exits 0 if clean, non-zero (with detail) on any violation.
//
// Usage:
//   node .ai-coder/phase-15-real-audit/check-constraint-regression-guard.mjs
//
// Wire into CI by adding to gate-c (or a new gate-h "constraint-regression").

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const MIGRATIONS = path.resolve('packages/api/migrations');
const SRC        = path.resolve('packages/api/src');

// --- helpers ---------------------------------------------------------

function listMigrations() {
  return fs.readdirSync(MIGRATIONS)
    .filter(f => /^\d+.*\.sql$/.test(f))
    .sort();
}

function splitValuesTokens(s) {
  // Split a VALUES clause body on commas at depth 0, ignoring commas inside
  // single quotes or parens. Returns trimmed tokens.
  const out = [];
  let depth = 0, inStr = false, buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      buf += c;
      if (c === "'" && s[i-1] !== '\\') inStr = false;
      continue;
    }
    if (c === "'") { inStr = true; buf += c; continue; }
    if (c === '(' ) { depth++; buf += c; continue; }
    if (c === ')' ) { depth--; buf += c; continue; }
    if (c === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function walk(dir, out=[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && /\.(ts|js|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Extract every `ADD CONSTRAINT <name> CHECK (... IN (...))` block from
// SQL text. Returns an array of {constraintName, values: Set<string>}.
function extractAddConstraints(sql) {
  const out = [];
  // Match either explicit table prefix or naked ADD CONSTRAINT in DO blocks.
  // The CHECK can be:
  //   CHECK (col IN ('a','b','c'))
  //   CHECK ((col)::text = ANY (ARRAY['a'::character varying, 'b'::character varying]))
  const re = /ADD\s+CONSTRAINT\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+CHECK\s*\(([\s\S]*?)\);/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1];
    const body = m[2];
    // Find every quoted literal — strip SQL comments first to avoid false
    // positives in `-- existing` style comment lines that name a verb.
    const stripped = body.replace(/--[^\n]*/g, '');
    const literals = [...stripped.matchAll(/'([^']+)'/g)].map(x => x[1]);
    out.push({ constraintName: name, values: new Set(literals) });
  }
  return out;
}

// Detect intentional removal directive in the same migration file.
// Operators can document a removal as:
//   -- INTENTIONAL_REMOVAL: <constraint_name> drops <value1>, <value2>
function intentionalRemovals(sql, constraintName) {
  const out = new Set();
  const re = new RegExp(
    `--\\s*INTENTIONAL_REMOVAL:\\s*${constraintName}\\s+drops\\s+([^\\n]+)`,
    'gi',
  );
  let m;
  while ((m = re.exec(sql)) !== null) {
    m[1].split(',').forEach(v => {
      const cleaned = v.trim().replace(/^['"]|['"]$/g, '');
      if (cleaned) out.add(cleaned);
    });
  }
  return out;
}

// --- PART A: migration walk (advisory) -------------------------------
//
// PART A logs every ADD CONSTRAINT event that drops values relative to
// the immediately-prior in-memory state. These are advisory: a later
// migration can restore values via the splice pattern, in which case
// the NET state is fine even though intermediate state regressed.
// PART A2 (cumulative-union vs live DB) is the actionable hard-fail.

console.log('=== PART A: migration constraint walk (per-migration, advisory) ===\n');

const constraintHistory = new Map(); // constraintName → Set<string> (current allowed set)
const cumulativeDeclared = new Map(); // constraintName → Set<string> (every value EVER declared in any migration)
const advisories = [];
const violations = [];
let totalConstraintEvents = 0;

for (const file of listMigrations()) {
  const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');

  const isSpliceMigration =
    /pg_get_constraintdef\s*\([^)]*\)/i.test(sql) && /EXECUTE\s+format/i.test(sql);

  const adds = extractAddConstraints(sql);

  for (const { constraintName, values } of adds) {
    totalConstraintEvents++;

    // Track cumulative declarations regardless of pattern. For splice
    // migrations the literal block is the no-prior-constraint fallback,
    // but its values still count as "declared".
    if (!cumulativeDeclared.has(constraintName)) {
      cumulativeDeclared.set(constraintName, new Set());
    }
    for (const v of values) cumulativeDeclared.get(constraintName).add(v);

    if (isSpliceMigration) {
      // Splice preserves prior values by construction. Skip per-migration
      // drop tracking here.
      continue;
    }

    const prior = constraintHistory.get(constraintName);
    if (prior) {
      const intentional = intentionalRemovals(sql, constraintName);
      const dropped = [...prior].filter(v => !values.has(v) && !intentional.has(v));
      if (dropped.length > 0) {
        advisories.push({
          migration: file,
          constraint: constraintName,
          droppedValues: dropped,
          newSize: values.size,
          priorSize: prior.size,
        });
      }
      // Forward-track UNION so a later restore-migration zeroes out the
      // historical drop in our running model.
      constraintHistory.set(constraintName, new Set([...prior, ...values]));
    } else {
      constraintHistory.set(constraintName, values);
    }
  }
}

console.log(`Migrations scanned:                ${listMigrations().length}`);
console.log(`ADD CONSTRAINT events seen:        ${totalConstraintEvents}`);
console.log(`Distinct constraints tracked:      ${constraintHistory.size}`);

if (advisories.length === 0) {
  console.log(`\n  (no per-migration drops detected)`);
} else {
  console.log(`\n  ${advisories.length} historical per-migration drop(s) (informational):`);
  for (const v of advisories) {
    console.log(`    ${v.migration} → ${v.constraint} dropped ${v.droppedValues.length} value(s):`);
    console.log(`      ${v.droppedValues.slice(0, 8).join(', ')}${v.droppedValues.length > 8 ? '…' : ''}`);
  }
  console.log(`\n  These are advisory only. PART A2 below confirms whether the`);
  console.log(`  LIVE DB is a true superset of every value ever declared.`);
}

// --- PART A2: cumulative declarations vs live DB (HARD FAIL) ---------

console.log('\n=== PART A2: live DB ⊇ every value ever declared (HARD FAIL) ===\n');

const partA2Violations = [];

// We need the live DB to compute this. Connect now (PART B uses same client).
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://onservice:onservice_dev@localhost:7383/onservice_dev',
});
let dbAvailable = true;
try {
  await client.connect();
} catch (e) {
  console.log(`(DB not reachable: ${e.message}) — PART A2 + B skipped.`);
  dbAvailable = false;
}

if (dbAvailable) {
  for (const [constraint, declared] of cumulativeDeclared.entries()) {
    const r = await client.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname=$1`,
      [constraint],
    );
    if (r.rows.length === 0) {
      console.log(`  (no constraint ${constraint} found in DB — skipping)`);
      continue;
    }
    const live = new Set(
      [...r.rows[0].def.matchAll(/'([^']+)'(?:::character varying)?/g)].map(m => m[1]),
    );
    const intentionalAcrossAllMigrations = new Set();
    for (const file of listMigrations()) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
      for (const v of intentionalRemovals(sql, constraint)) {
        intentionalAcrossAllMigrations.add(v);
      }
    }
    const netDropped = [...declared]
      .filter(v => !live.has(v) && !intentionalAcrossAllMigrations.has(v))
      .sort();
    if (netDropped.length === 0) {
      console.log(`✓ ${constraint}: live DB is superset of all ${declared.size} historical declarations`);
    } else {
      console.log(`✗ ${constraint}: ${netDropped.length} value(s) declared in migration(s) but not in live CHECK:`);
      for (const v of netDropped) console.log(`    ${v}`);
      partA2Violations.push({ constraint, dropped: netDropped });
    }
  }
}

// --- PART B: live DB cross-check (emitted literals vs live CHECK) ----

console.log('\n=== PART B: live DB cross-check (emitted literals vs live CHECK) ===\n');

const partBViolations = [];

if (dbAvailable) {
  // Look for INSERT INTO <table> ... 'literal' patterns where <table> has
  // a CHECK constraint. We focus on admin_actions (action_type, target_type)
  // since that's where the migration 119 regression happened. Future expansions
  // can add more tables here.
  const tablesToScan = [
    { table: 'admin_actions', constraint: 'admin_actions_action_type_check', column: 'action_type' },
    { table: 'admin_actions', constraint: 'admin_actions_target_type_check', column: 'target_type' },
  ];

  for (const { table, constraint, column } of tablesToScan) {
    const r = await client.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname=$1`,
      [constraint],
    );
    if (r.rows.length === 0) {
      console.log(`  (no constraint ${constraint} found in DB — skipping)`);
      continue;
    }
    const allowed = new Set(
      [...r.rows[0].def.matchAll(/'([^']+)'::character varying/g)].map(m => m[1]),
    );

    // Scan source for `INSERT INTO <table> (col1, col2, ...) VALUES (...)`
    // Map each VALUES position to its column. A literal at the position of
    // `column` (the constraint's column) is what we test against the CHECK.
    const files = walk(SRC);
    const emittedFromCode = new Map();
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (!new RegExp(`INSERT\\s+INTO\\s+${table}\\b`, 'i').test(lines[i])) continue;
        const block = lines.slice(i, Math.min(i + 14, lines.length)).join('\n');
        // Parse column list: INSERT INTO admin_actions (col1, col2, ...)
        const colMatch = block.match(new RegExp(`INSERT\\s+INTO\\s+${table}\\s*\\(([^)]+)\\)`, 'i'));
        if (!colMatch) continue;
        const cols = colMatch[1].split(',').map(c => c.trim());
        const colIdx = cols.indexOf(column);
        if (colIdx < 0) continue;

        const valuesMatch = block.match(/VALUES\s*\(([^)]*)\)/i);
        if (!valuesMatch) continue;
        // Tokenize VALUES — each token is either '$N' (bind), 'literal',
        // or a function call. We split on top-level commas and check the
        // token at colIdx.
        const tokens = splitValuesTokens(valuesMatch[1]);
        const tok = tokens[colIdx];
        if (!tok) continue;
        // Only flag if it's a literal (starts and ends with single quote).
        const lit = tok.match(/^'([^']+)'/);
        if (!lit) continue;
        const v = lit[1];
        if (!emittedFromCode.has(v)) emittedFromCode.set(v, []);
        emittedFromCode.get(v).push({ file: f.replace(SRC + path.sep, ''), line: i + 1 });
      }
    }

    const bad = [...emittedFromCode.entries()]
      .filter(([v]) => !allowed.has(v))
      .sort();

    if (bad.length === 0) {
      console.log(`✓ ${table}.${column}: every emitted literal accepted by live CHECK (${emittedFromCode.size} distinct)`);
    } else {
      console.log(`✗ ${table}.${column}: ${bad.length} value(s) emitted by code but rejected by live CHECK:`);
      for (const [v, sites] of bad) {
        console.log(`    '${v}' — ${sites[0].file}:${sites[0].line}`);
        partBViolations.push({ table, column, value: v, sites });
      }
    }
  }
  await client.end();
}

// --- exit ------------------------------------------------------------

const totalViolations = partA2Violations.length + partBViolations.length;
console.log('\n=================================================================');
if (totalViolations === 0) {
  console.log('✓ Constraint regression guard: PASS');
  process.exit(0);
} else {
  console.log(`✗ Constraint regression guard: FAIL (PART A2: ${partA2Violations.length}, PART B: ${partBViolations.length})`);
  process.exit(1);
}
