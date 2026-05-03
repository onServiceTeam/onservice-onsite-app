// Phase 25a — extract every router.<verb>(...) declaration from every admin
// route file + audit which middleware is wired in. Looking for:
//   1. Routes without authMiddleware
//   2. Mutating routes (POST/PUT/PATCH/DELETE) where neither requireAdmin /
//      requireSuperAdmin / requireDpoRole / requireSuperAdminRole appears
//      in the route handler body
//   3. State-changing routes that lack the global requireAdminCsrf wrapper
//      (covered by mount-level middleware in server.ts; sanity check).

import fs from 'fs';
import path from 'path';

const ROUTES_DIR = path.resolve('packages/api/src/routes');
const ADMIN_FILES = fs.readdirSync(ROUTES_DIR).filter(
  f => /admin/i.test(f) || ['breach-log.routes.ts'].includes(f)
);

console.log('Scanning ' + ADMIN_FILES.length + ' admin route files:');
ADMIN_FILES.forEach(f => console.log('  - ' + f));

// Patterns we care about:
const HAS_AUTH_MW = /authMiddleware/;
const HAS_REQUIRE_ADMIN_FN = /requireAdmin\s*\(\s*req\s*\)|requireSuperAdmin\s*\(\s*req\s*\)|requireSuperAdminRole|requireDpoRole|requireRole|requireAdminRole|allowAdmin|allowSuperAdmin|withDpoRole/;

const issues = [];
let totalRoutes = 0;

for (const fname of ADMIN_FILES) {
  const fpath = path.join(ROUTES_DIR, fname);
  const text = fs.readFileSync(fpath, 'utf8');
  const lines = text.split(/\r?\n/);

  // Check for router-level middleware — applies to ALL routes in this file
  const fileLevelHasAuth = /router\.use\s*\([^)]*authMiddleware/.test(text);
  const fileLevelHasRole = /router\.use\s*\([^)]*(rbacMiddleware|requireSuperAdminRole|requireDpoRole|requireAdminRole)/.test(text);

  // Find each router.<verb>('path', ... ) declaration
  const routeRe = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = routeRe.exec(text)) !== null) {
    totalRoutes++;
    const verb = m[1].toUpperCase();
    const route = m[2];
    // Find the line number
    const before = text.slice(0, m.index);
    const lineNum = before.split('\n').length;

    // Capture the next ~80 lines as the route's handler block
    const block = lines.slice(lineNum - 1, Math.min(lineNum + 80, lines.length)).join('\n');
    // Trim block at the next router.<verb>(... call to avoid bleed-over
    const nextRouteIdx = block.indexOf('router.', 50);
    const handlerBlock = nextRouteIdx > 0 ? block.slice(0, nextRouteIdx) : block;

    const hasAuthMw = fileLevelHasAuth || HAS_AUTH_MW.test(handlerBlock);
    const hasRoleEnf = fileLevelHasRole || HAS_REQUIRE_ADMIN_FN.test(handlerBlock);
    const isMutating = ['POST','PUT','PATCH','DELETE'].includes(verb);

    if (!hasAuthMw) {
      issues.push({
        file: fname, line: lineNum, verb, route,
        issue: 'NO_AUTH_MIDDLEWARE',
      });
    }
    if (!hasRoleEnf) {
      issues.push({
        file: fname, line: lineNum, verb, route,
        issue: 'NO_ROLE_ENFORCEMENT',
      });
    }
  }
}

console.log('\nTotal admin routes scanned: ' + totalRoutes);
console.log('Issues found: ' + issues.length);

if (issues.length === 0) {
  console.log('\n✓ Every admin route has authMiddleware + role enforcement.');
} else {
  const byIssue = {};
  for (const i of issues) {
    if (!byIssue[i.issue]) byIssue[i.issue] = [];
    byIssue[i.issue].push(i);
  }
  for (const [type, list] of Object.entries(byIssue)) {
    console.log('\n=== ' + type + ' (' + list.length + ') ===');
    for (const i of list) {
      console.log('  ' + i.file + ':' + i.line + ' — ' + i.verb + ' ' + i.route);
    }
  }
}

// Save full output
fs.writeFileSync(
  '.ai-coder/phase-15-real-audit/phase25a-route-extract.json',
  JSON.stringify({ totalRoutes, issues }, null, 2),
);
console.log('\nSaved: .ai-coder/phase-15-real-audit/phase25a-route-extract.json');
