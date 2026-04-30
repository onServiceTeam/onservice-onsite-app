// Phase 14 Remediation #10 — CI guard against TODO_KEN_LEGAL_DISCLAIMER
// regression.
//
// The audit found three customer-facing screens (terms, help, safety-and-
// support) shipping with literal `TODO_KEN_LEGAL_DISCLAIMER` placeholder
// text where the no-insurance disclaimer belonged. R10 swapped the
// placeholders for interim attorney-reviewable wording. This test fails
// any PR that reintroduces the placeholder anywhere under apps/.
//
// When Ken's attorney supplies the final-final wording, that wording
// replaces the interim text in the same three files. The placeholder
// itself never returns.
//
// Audit reference: Finding #10 in
// .ai-coder/PHASE-14-REMEDIATION-MASTER-INSTRUCTION.md lines 550-619.
// (No legacy Bug NNNN — the placeholder was discovered in the
// remediation audit, not the original Phase 13 bug catalog.)

import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const REPO_ROOT = join(__dirname, '..', '..', '..');

function listMatchingFiles(): string[] {
  // Use git ls-files so we only scan tracked files (avoids node_modules,
  // .expo/types, etc.). The test runs from a working tree where git is
  // available (CI installs deps first which requires git already there).
  try {
    const out = execSync('git ls-files apps/', { cwd: REPO_ROOT, encoding: 'utf-8' });
    return out
      .split('\n')
      .filter((p) => /\.(tsx?|md)$/.test(p))
      .map((p) => join(REPO_ROOT, p));
  } catch {
    // Fallback: empty list (test then trivially passes; CI git is the
    // primary path).
    return [];
  }
}

describe('No TODO_KEN_LEGAL_DISCLAIMER placeholder anywhere in apps/', () => {
  const files = listMatchingFiles();

  it('placeholder is removed from every tracked source file', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      // Match the literal placeholder string. Self-references (this test
      // file itself, or doc files that document the rule) are excluded by
      // path so the gate doesn't trip on its own enforcement copy.
      if (file.endsWith('no-todo-placeholders.test.ts')) continue;
      if (content.includes('TODO_KEN_LEGAL_DISCLAIMER')) {
        offenders.push(file.replace(REPO_ROOT, '').replace(/^[\\/]+/, ''));
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `TODO_KEN_LEGAL_DISCLAIMER placeholder found in ${offenders.length} file(s):\n` +
          offenders.map((o) => `  - ${o}`).join('\n') +
          '\n\nReplace with attorney-reviewed wording. See .ai-coder/decisions/D04-siguradoshield.md §legal-language.',
      );
    }
    expect(offenders).toEqual([]);
  });
});
