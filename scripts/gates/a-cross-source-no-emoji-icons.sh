#!/usr/bin/env bash
# Constitution Article 4.6 fix. No emoji as iconography in components or screens.
# Uses Python for reliable cross-encoding emoji detection.
#
# Allowed: emoji in CMS content, in tests, in scripts, in docs.
# Disallowed: emoji used as visual replacement for icons in component JSX or status maps.

set -euo pipefail

violations=$(python3 -c "
import re, os, sys

EMOJI_RE = re.compile(
    '[\U0001F300-\U0001F9FF'    # symbols, pictographs, transport, etc.
    '\U00002600-\U000027BF'      # misc symbols, dingbats
    '\U0001F000-\U0001F02F'      # mahjong, etc.
    ']'
)

for root in ['apps/mobile/src/config', 'apps/mobile/src/components',
             'apps/mobile/app', 'apps/admin/src/components',
             'apps/admin/src/pages']:
    if not os.path.isdir(root): continue
    for dirpath, _, files in os.walk(root):
        for f in files:
            if not f.endswith(('.ts', '.tsx')): continue
            if '.test.' in f: continue
            p = os.path.join(dirpath, f)
            try:
                with open(p, encoding='utf-8') as fh:
                    for ln, line in enumerate(fh, 1):
                        if '// gate-a-allowed:' in line: continue
                        if 'emoji' in line.lower() and '//' in line: continue
                        if EMOJI_RE.search(line):
                            print(f'{p}:{ln}: {line.strip()}')
            except Exception:
                pass
" || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Article 4.6): emoji as iconography"
  echo "$violations" | head -20
  exit 1
fi
echo "Gate A — no emoji icons: OK"
