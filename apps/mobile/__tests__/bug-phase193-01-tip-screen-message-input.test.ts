// BUG-PHASE193-01 — tip screen had no optional message input
// despite API + DB + provider notification supporting it. The screen
// was missing functionality the screen is supposed to have. Fix:
// add an optional 500-char message input wired to sendTip().

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/customer/booking/tip.tsx'),
  'utf8',
);

describe('BUG-PHASE193-01 — tip screen has optional message input', () => {
  it('declares a message state hook', () => {
    expect(SOURCE).toMatch(
      /const \[message, setMessage\] = useState\(''\)/,
    );
  });

  it('passes message through to sendTip', () => {
    expect(SOURCE).toMatch(
      /sendTip\(\{[\s\S]+?message:\s*message\.trim\(\)\s*\|\|\s*undefined/,
    );
  });

  it('renders TextInput with maxLength={500} for the message', () => {
    expect(SOURCE).toMatch(
      /messageInput[\s\S]+?maxLength=\{500\}/,
    );
  });

  it('shows char counter when message is non-empty', () => {
    expect(SOURCE).toMatch(
      /\{message\.length\s*>\s*0\s*&&[\s\S]+?\{message\.length\}\/500/,
    );
  });

  it('PHASE193-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE193-01 fix/);
  });
});
