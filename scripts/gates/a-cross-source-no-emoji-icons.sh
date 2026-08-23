#!/usr/bin/env bash
# Constitution Article 4.6 fix. No emoji as iconography in components or screens.
# Uses the repository's required Node runtime for cross-platform detection.
# Gate maintenance (2026-08-23): replaced the optional `python3 ... || true`
# scanner because missing Python caused a false-green local gate on Windows.
#
# Allowed: emoji in CMS content, in tests, in scripts, in docs.
# Disallowed: emoji used as visual replacement for icons in component JSX or status maps.

set -euo pipefail

violations=$(node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const emojiPattern = /[\u{1F000}-\u{1F02F}\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/u;
const roots = [
  'apps/mobile/src/config',
  'apps/mobile/src/components',
  'apps/mobile/app',
  'apps/admin/src/components',
  'apps/admin/src/pages',
];

function scan(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(filePath);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes('// gate-a-allowed:')) return;
      if (line.toLowerCase().includes('emoji') && line.includes('//')) return;
      if (emojiPattern.test(line)) {
        process.stdout.write(`${filePath}:${index + 1}: ${line.trim()}\n`);
      }
    });
  }
}

roots.forEach(scan);
NODE
)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Article 4.6): emoji as iconography"
  echo "$violations" | head -20
  exit 1
fi
echo "Gate A — no emoji icons: OK"
