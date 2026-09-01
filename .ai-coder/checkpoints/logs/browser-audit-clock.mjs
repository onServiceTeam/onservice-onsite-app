export const AUDIT_NOW_ISO = '2026-08-31T00:00:00.000Z';

export const AUDIT_CHROMIUM_ARGS = [
  '--disable-gpu',
  '--disable-lcd-text',
  '--font-render-hinting=none',
];

export const AUDIT_CONTEXT_OPTIONS = {
  reducedMotion: 'reduce',
};

export const AUDIT_SCREENSHOT_OPTIONS = {
  animations: 'disabled',
  caret: 'hide',
};

/**
 * Keep browser evidence deterministic while leaving timers and animation
 * scheduling intact. The audit fixtures use fixed dates, so a real wall clock
 * would turn future bookings into overdue work and change screenshots daily.
 */
export async function installFixedBrowserTime(page) {
  await page.addInitScript(({ nowIso }) => {
    const RealDate = Date;
    const fixedNow = new RealDate(nowIso).valueOf();
    const FixedDate = new Proxy(RealDate, {
      apply(target, thisArg, args) {
        if (args.length === 0) return new target(fixedNow).toString();
        return Reflect.apply(target, thisArg, args);
      },
      construct(target, args) {
        return args.length === 0
          ? new target(fixedNow)
          : Reflect.construct(target, args);
      },
    });
    Object.defineProperty(FixedDate, 'now', { value: () => fixedNow });
    globalThis.Date = FixedDate;
  }, { nowIso: AUDIT_NOW_ISO });
}

/**
 * Wait for the rendered data and browser fonts, then neutralize visual-only
 * motion that can move pixels between otherwise identical screenshots.
 */
export async function settleBrowserEvidence(page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
  });
  await page.waitForTimeout(100);
}
