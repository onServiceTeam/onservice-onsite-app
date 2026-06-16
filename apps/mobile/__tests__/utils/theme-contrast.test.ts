// Real assertion on the actual theme tokens: body/caption text colors must meet
// WCAG AA contrast (4.5:1) against the app background.
//
// Bug (reported by a tester, 2026-06-16): "make the font and font color more
// visible." colors.textTertiary was #9CA3AF, only ~2.5:1 on white — fails AA and
// is genuinely hard to read for captions/placeholders/fine print. It was
// darkened to #6E7480 (~4.7:1). This test computes the real contrast ratio from
// the token values and guards against regressing any text token below AA.

import { colors } from '../../src/config/theme';

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a hex color: ${hex}`);
  const r = channel(parseInt(m[1]!, 16));
  const g = channel(parseInt(m[2]!, 16));
  const b = channel(parseInt(m[3]!, 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_NORMAL = 4.5;

describe('Theme text contrast (WCAG AA on background)', () => {
  it('Bug 2026-06-16 — textTertiary meets AA contrast on the app background (was #9CA3AF, ~2.5:1)', () => {
    const ratio = contrastRatio(colors.textTertiary, colors.background);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('primary and secondary text tokens also meet AA on the background', () => {
    expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(colors.textSecondary, colors.background)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
