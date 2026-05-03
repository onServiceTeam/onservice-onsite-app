// Phase 24a — extract every verb + target_type literal from `INSERT INTO admin_actions`.
// Cross-check against live DB CHECK constraints.
//
// Strategy: scan packages/api/src for `INSERT INTO admin_actions` blocks and the
// next ~12 lines that contain VALUES (...). Pull literals 'foo' surrounded by
// single quotes that aren't bind params ($1...).

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import pg from 'pg';

const SRC = path.resolve('packages/api/src');

function walk(dir, out=[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && /\.(ts|js|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const emittedActionVerbs = new Set();
const emittedTargetTypes = new Set();
const callSites = []; // {file, line, action_type, target_type}

for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  // Find each occurrence of "INSERT INTO admin_actions"
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/INSERT\s+INTO\s+admin_actions/i.test(lines[i])) continue;
    // Look at next 12 lines for VALUES (... )
    const block = lines.slice(i, Math.min(i + 14, lines.length)).join('\n');
    // Match VALUES ($1, 'verb', 'target', ...)  or  VALUES ($1, $2, $3, ...) (dynamic)
    const valuesMatch = block.match(/VALUES\s*\(([^)]*)\)/i);
    if (!valuesMatch) continue;
    const inner = valuesMatch[1];
    // Pull all 'literal' strings
    const literals = [...inner.matchAll(/'([^']+)'/g)].map(m => m[1]);
    // Conventional column order for our codebase:
    //   (admin_id, action_type, target_type, target_id, details[, reason|notes])
    // The first one or two literals (after $-binds) are the action_type and target_type.
    if (literals.length >= 1) {
      const a = literals[0];
      emittedActionVerbs.add(a);
      callSites.push({ file: f.replace(SRC + path.sep, ''), line: i + 1, verb: a, target: literals[1] || null });
    }
    if (literals.length >= 2) emittedTargetTypes.add(literals[1]);
  }
}

console.log(`Files scanned:    ${files.length}`);
console.log(`Call sites found: ${callSites.length}`);
console.log(`Distinct verbs emitted in code:        ${emittedActionVerbs.size}`);
console.log(`Distinct target_types emitted in code: ${emittedTargetTypes.size}`);

// Now ALSO scan service files for `await pool.query(\`INSERT INTO admin_actions (...) VALUES ($1, $2, $3, ...)`
// where the verb is bound dynamically. For these we need a different strategy: find
// callers of helpers like recordAdminAction()/logAdminAction().

// Connect to live DB and pull CHECK constraint
const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://onservice:onservice_dev@localhost:7383/onservice_dev' });
await client.connect();
const r = await client.query(`SELECT pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE conname='admin_actions_action_type_check'`);
const r2 = await client.query(`SELECT pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE conname='admin_actions_target_type_check'`);
const allowedActionVerbs = new Set([...r.rows[0].def.matchAll(/'([^']+)'::character varying/g)].map(m => m[1]));
const allowedTargetTypes = new Set([...r2.rows[0].def.matchAll(/'([^']+)'::character varying/g)].map(m => m[1]));

console.log(`\nAllowed verbs in DB CHECK:        ${allowedActionVerbs.size}`);
console.log(`Allowed target_types in DB CHECK: ${allowedTargetTypes.size}`);

const emittedNotAllowed = [...emittedActionVerbs].filter(v => !allowedActionVerbs.has(v)).sort();
const allowedNotEmitted = [...allowedActionVerbs].filter(v => !emittedActionVerbs.has(v)).sort();
const emittedTargetNotAllowed = [...emittedTargetTypes].filter(t => !allowedTargetTypes.has(t)).sort();
const allowedTargetNotEmitted = [...allowedTargetTypes].filter(t => !emittedTargetTypes.has(t)).sort();

console.log('\n=== Action verbs emitted in code BUT NOT in CHECK (would crash if hit) ===');
emittedNotAllowed.forEach(v => console.log(`  ✗ ${v}`));
if (emittedNotAllowed.length === 0) console.log('  (none) ✓');

console.log('\n=== Action verbs in CHECK BUT NEVER emitted (potentially dead code, or emitted dynamically) ===');
allowedNotEmitted.forEach(v => console.log(`  ? ${v}`));

console.log('\n=== Target types emitted in code BUT NOT in CHECK ===');
emittedTargetNotAllowed.forEach(t => console.log(`  ✗ ${t}`));
if (emittedTargetNotAllowed.length === 0) console.log('  (none) ✓');

console.log('\n=== Target types in CHECK BUT NEVER emitted ===');
allowedTargetNotEmitted.forEach(t => console.log(`  ? ${t}`));

// Group by verb -> emit count + sample sites
const byVerb = new Map();
for (const cs of callSites) {
  if (!byVerb.has(cs.verb)) byVerb.set(cs.verb, []);
  byVerb.get(cs.verb).push(cs);
}

console.log('\n=== Verb → emit count + first call site ===');
[...byVerb.entries()].sort().forEach(([v, sites]) => {
  console.log(`  ${v.padEnd(40)} ${String(sites.length).padStart(3)}  ${sites[0].file}:${sites[0].line}`);
});

await client.end();

// Save full list for follow-up
const out = {
  summary: {
    files_scanned: files.length,
    call_sites: callSites.length,
    emitted_verbs: [...emittedActionVerbs].sort(),
    emitted_target_types: [...emittedTargetTypes].sort(),
    allowed_verbs: [...allowedActionVerbs].sort(),
    allowed_target_types: [...allowedTargetTypes].sort(),
    emitted_not_allowed: emittedNotAllowed,
    allowed_not_emitted: allowedNotEmitted,
    emitted_target_not_allowed: emittedTargetNotAllowed,
    allowed_target_not_emitted: allowedTargetNotEmitted,
  },
  callSites,
};
fs.writeFileSync('.ai-coder/phase-15-real-audit/phase24a-verb-extract.json', JSON.stringify(out, null, 2));
console.log('\nSaved: .ai-coder/phase-15-real-audit/phase24a-verb-extract.json');
