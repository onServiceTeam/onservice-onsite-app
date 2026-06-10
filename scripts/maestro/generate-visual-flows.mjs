#!/usr/bin/env node
/**
 * F#3 — regenerate the Maestro visual-baseline flows with REAL navigation.
 *
 * The Phase 14 R3 scaffolds had three defects that made them uncapturable:
 *   1. appId said com.onservice.app; the real Android package is
 *      ph.onservice.app (app.config.ts).
 *   2. Every flow ran launchApp clearState:true and screenshotted
 *      immediately — after a state wipe the app boots to onboarding/login,
 *      so all 84 "screens" would have been the same login screenshot.
 *   3. takeScreenshot paths pointed outside the baselines directory.
 *
 * This generator rewrites each flow to: launch the app (state preserved
 * from the 000-setup-login flow that runs first in each directory), deep
 * link straight to the target screen via the `onservice` scheme
 * (expo-router maps URL path -> route), wait for the UI to settle, and
 * screenshot into .maestro/visual/baselines/<kind>/<slug>/default.png.
 *
 * Dynamic [param] segments become ${MAESTRO_*} env placeholders; the
 * capture wrapper (scripts/maestro/capture-baselines.sh) resolves real ids
 * from the seeded local database and passes them with -e flags.
 *
 * Usage:  node scripts/maestro/generate-visual-flows.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const visualRoot = join(repoRoot, 'apps', 'mobile', '.maestro', 'visual');

const APP_ID = 'ph.onservice.app';

// Param-name -> Maestro env var. The wrapper script resolves these from the
// seeded DB (see capture-baselines.sh).
const PARAM_ENV = {
  id: null, // resolved per-route below — "id" means different entities
  bookingId: 'MAESTRO_BOOKING_ID',
};

// Route-specific id resolution for the ambiguous "[id]" segment.
function envForRoute(routePath) {
  if (routePath.includes('/booking/')) return 'MAESTRO_BOOKING_ID';
  if (routePath.includes('/job/')) return 'MAESTRO_JOB_ID'; // provider-side booking id
  if (routePath.includes('/chat/')) return 'MAESTRO_CONVERSATION_ID';
  if (routePath.includes('/category/')) return 'MAESTRO_CATEGORY_ID';
  if (routePath.includes('/provider/')) return 'MAESTRO_PROVIDER_ID';
  if (routePath.includes('/recurring/')) return 'MAESTRO_RECURRING_ID';
  return 'MAESTRO_ID';
}

/** apps/mobile/app/(tabs)/bookings.tsx -> /bookings  (groups stripped) */
function screenFileToRoute(screenFile) {
  let p = screenFile.replace(/^apps\/mobile\/app\//, '').replace(/\.tsx$/, '');
  p = p
    .split('/')
    .filter((seg) => !(seg.startsWith('(') && seg.endsWith(')')))
    .join('/');
  if (p.endsWith('/index')) p = p.slice(0, -'/index'.length);
  if (p === 'index') p = '';
  return '/' + p;
}

function flowYaml({ slug, kind, route, screenFile }) {
  const envVar = route.includes('[') ? envForRoute(route) : null;
  const linkPath = route.replace(/\[(\w+)\]/g, (m, name) => {
    if (name === 'bookingId') return '${' + PARAM_ENV.bookingId + '}';
    return '${' + envVar + '}';
  });
  return `appId: ${APP_ID}
---
# F#3 visual baseline — ${slug}
# Screen: ${screenFile}
# Session comes from 000-setup-login.yaml (runs first in this directory);
# deep link jumps straight to the target route via expo-router.

- launchApp:
    stopApp: false
- openLink: onservice:/${linkPath}
- extendedWaitUntil:
    notVisible:
      id: "loading"
    timeout: 2000
    optional: true
- waitForAnimationToEnd:
    timeout: 4000
- takeScreenshot: .maestro/visual/baselines/${kind}/${slug}/default
`;
}

function loginYaml(kind, phoneEnv) {
  const landing = kind === 'customer' ? 'Active Bookings|What do you need\\?' : 'Hello,';
  return `appId: ${APP_ID}
---
# F#3 — ${kind} session bootstrap. Runs first (000- prefix) in this
# directory; the per-screen flows reuse the session it creates.
# Requires the local dev API (ALLOW_DEV_OTP=1, code 000000) and the
# seeded test ${kind} account passed as \${${phoneEnv}} (digits after +63).

- launchApp:
    clearState: true
    stopApp: true
- waitForAnimationToEnd:
    timeout: 5000
# First boot may show the onboarding carousel; skip it if present.
- runFlow:
    when:
      visible: "Skip"
    commands:
      - tapOn: "Skip"
- runFlow:
    when:
      visible: "Get Started"
    commands:
      - tapOn: "Get Started"
- waitForAnimationToEnd:
    timeout: 3000
# Login: phone + dev OTP.
- tapOn: "Mobile Number"
- inputText: \${${phoneEnv}}
- tapOn: "Send Verification Code"
- waitForAnimationToEnd:
    timeout: 4000
- tapOn: "Enter 6-digit code"
- inputText: "000000"
# Auto-verifies at 6 digits and lands on the ${kind} home surface.
- extendedWaitUntil:
    visible: "${landing}"
    timeout: 15000
`;
}

let rewritten = 0;
for (const kind of ['customer', 'provider']) {
  const dir = join(visualRoot, kind);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.yaml') || file.startsWith('000-')) continue;
    const full = join(dir, file);
    const src = readFileSync(full, 'utf8');
    const m = src.match(/# Screen: (\S+)/);
    if (!m) {
      console.error(`SKIP (no # Screen header): ${kind}/${file}`);
      continue;
    }
    const screenFile = m[1];
    const slug = file.replace(/^\d+-/, '').replace(/\.yaml$/, '');
    const route = screenFileToRoute(screenFile);
    writeFileSync(full, flowYaml({ slug, kind, route, screenFile }));
    rewritten++;
  }
  const phoneEnv = kind === 'customer' ? 'MAESTRO_CUSTOMER_PHONE' : 'MAESTRO_PROVIDER_PHONE';
  writeFileSync(join(dir, '000-setup-login.yaml'), loginYaml(kind, phoneEnv));
}
console.log(`rewrote ${rewritten} flows + 2 login setup flows`);
