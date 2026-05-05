// BUG-PHASE102-01 — help screens disagreed with the rest of the app
// about the app version.
//
// Pre-fix:
//   - apps/mobile/app/customer/help.tsx footer:
//       <Text>onService v1.0.0</Text>
//   - apps/mobile/app/provider/help.tsx footer:
//       <Text>onService v1.0.0</Text>
//   - apps/mobile/app/(tabs)/profile.tsx footer:
//       <Text>Version {platformConfig.appVersion}</Text>
//   - apps/mobile/src/config/platform.config.ts: appVersion: '0.1.0'
//
// Same app, three different version strings. Users contacting support
// would say "I'm on v1.0.0" (from Help) while crash reports came in
// tagged 0.1.0 from package.json. Confusing for support, confusing
// for analytics, confusing for QA.
//
// Fix: both help screens now read from platformConfig.appVersion so
// the displayed version stays in lock-step with package.json (which
// platform.config.ts mirrors at build time). No more drift.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CUSTOMER_HELP = readFileSync(
  resolve(__dirname, '../app/customer/help.tsx'),
  'utf8',
);
const PROVIDER_HELP = readFileSync(
  resolve(__dirname, '../app/provider/help.tsx'),
  'utf8',
);

describe('BUG-PHASE102-01 — help screens read version from platformConfig', () => {
  it('BUG-PHASE102-01 — customer help imports platformConfig', () => {
    expect(CUSTOMER_HELP).toMatch(/import \{ platformConfig \} from '@\/config\/platform\.config'/);
  });

  it('BUG-PHASE102-01 — customer help footer renders platformConfig.appVersion', () => {
    expect(CUSTOMER_HELP).toMatch(/onService v\{platformConfig\.appVersion\}/);
  });

  it('BUG-PHASE102-01 — provider help imports platformConfig', () => {
    expect(PROVIDER_HELP).toMatch(/import \{ platformConfig \} from '@\/config\/platform\.config'/);
  });

  it('BUG-PHASE102-01 — provider help footer renders platformConfig.appVersion', () => {
    expect(PROVIDER_HELP).toMatch(/onService v\{platformConfig\.appVersion\}/);
  });

  it('BUG-PHASE102-01 — pre-fix hardcoded "onService v1.0.0" string is gone from both screens', () => {
    // The exact pre-fix string that disagreed with package.json.
    expect(CUSTOMER_HELP).not.toMatch(/onService v1\.0\.0</);
    expect(PROVIDER_HELP).not.toMatch(/onService v1\.0\.0</);
  });
});
