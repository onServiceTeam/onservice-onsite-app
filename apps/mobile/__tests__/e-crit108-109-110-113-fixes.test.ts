// Phase E CRIT-108 / CRIT-109 / CRIT-110 / CRIT-113 — fixes verified.
//
// Source-shape regex tests confirming the real fixes landed in the
// audited files. Per CLAUDE.md F#7 audit: real assertions on real
// source content, no `expect(existsSync(...)).toBe(true)` patterns,
// one test per `it('Bug NNNN — ...')` block.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import React from 'react';
import { render } from '@testing-library/react';
import ProviderSkillsScreen from '../app/provider/skills';
import { Routes } from '@/config/navigation';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const WITHDRAW = readFileSync(
  resolve(__dirname, '../app/provider/withdraw.tsx'),
  'utf8',
);
const SKILLS = readFileSync(
  resolve(__dirname, '../app/provider/skills.tsx'),
  'utf8',
);
const PORTFOLIO = readFileSync(
  resolve(__dirname, '../app/provider/portfolio.tsx'),
  'utf8',
);
const CERTIFICATIONS = readFileSync(
  resolve(__dirname, '../app/provider/certifications.tsx'),
  'utf8',
);

describe('Phase E CRIT-113 — withdraw screen wires real /trends data', () => {
  it('CRIT-113 — trendsQuery hits /providers/me/earnings/trends', () => {
    expect(WITHDRAW).toMatch(
      /\/api\/v1\/providers\/me\/earnings\/trends\?period=daily&days=7/,
    );
  });
  it('CRIT-113 — fake EarningsChart array (availableBalance/7) removed', () => {
    expect(WITHDRAW).not.toMatch(/Math\.round\(availableBalance \/ 7\)/);
  });
  it('CRIT-113 — chart only renders when real data is present', () => {
    expect(WITHDRAW).toMatch(/trendsQuery\.data\?\.length \?\? 0\) > 0/);
  });
  it('CRIT-113 — chart maps real period+netEarned rows to {date,amount}', () => {
    expect(WITHDRAW).toMatch(/trendsQuery\.data \?\? \[\]\)\.map/);
    expect(WITHDRAW).toMatch(/row\.period\.split\('T'\)\[0\] \?\? row\.period/);
    expect(WITHDRAW).toMatch(/amount: row\.netEarned/);
  });
});

describe('Phase E CRIT-110 — skills.tsx deprecated and redirects', () => {
  it('CRIT-110 — api.post call to /me/skills removed (header comment may still mention it)', () => {
    // Pre-fix: api.post('/api/v1/providers/me/skills', payload)
    // Post-fix: no api.post anywhere; the URL string may appear in
    // the deprecation header comment for context.
    expect(SKILLS).not.toMatch(/api\.post\(['"`]\/api\/v1\/providers\/me\/skills/);
    expect(SKILLS).not.toMatch(/import api from/);
  });
  it('CRIT-110 — hardcoded subcategory id arrays removed (no live data)', () => {
    // The pre-fix file had real array entries like
    //   { id: 'cleaning-general', name: 'General' }
    // The post-fix file may still mention these strings in the
    // header comment explaining WHY the screen was deprecated, so
    // assert the real-data shape is gone, not the string itself.
    expect(SKILLS).not.toMatch(/\{ id: ['"]cleaning-general['"]/);
    expect(SKILLS).not.toMatch(/\{ id: ['"]plumb-leak['"]/);
    expect(SKILLS).not.toMatch(/CATEGORIES: CategoryDef\[\]/);
  });
  it('CRIT-110 — replaces with redirect to /provider/services on mount', () => {
    render(React.createElement(ProviderSkillsScreen));
    expect(mockReplace).toHaveBeenCalledWith(Routes.PROVIDER.SERVICES);
  });
  it('CRIT-110 — explanatory message points user at the real services screen', () => {
    expect(SKILLS).toMatch(/Manage Your Services/);
    expect(SKILLS).toMatch(/Go to Services/);
  });
});

describe('Phase E CRIT-108 — portfolio.tsx replaces paste-URL with real picker+upload', () => {
  it('CRIT-108 — imports expo-image-picker', () => {
    expect(PORTFOLIO).toMatch(/from ['"]expo-image-picker['"]/);
  });
  it('CRIT-108 — imports uploadImages from upload.service', () => {
    expect(PORTFOLIO).toMatch(/import \{ uploadImages \} from ['"]@\/services\/upload\.service['"]/);
  });
  it('CRIT-108 — paste-URL TextInput placeholder gone', () => {
    expect(PORTFOLIO).not.toMatch(/placeholder=["']Image URL/);
  });
  it('CRIT-108 — handleSubmit uploads pendingLocalUri before POST', () => {
    expect(PORTFOLIO).toMatch(/uploadImages\(\[pendingLocalUri\], ['"]onboarding['"]\)/);
  });
  it('CRIT-108 — picker UI exposes both camera and gallery', () => {
    // Camera capture goes through the web-aware helper (utils/image-capture)
    // so the same button works in desktop/tablet browsers; gallery still
    // calls expo-image-picker directly.
    expect(PORTFOLIO).toMatch(/captureImageAsync/);
    expect(PORTFOLIO).toMatch(/launchImageLibraryAsync/);
  });
  it('CRIT-108 — uses canonical getErrorMessage (not raw err.message)', () => {
    expect(PORTFOLIO).toMatch(/import \{ getErrorMessage \} from/);
    expect(PORTFOLIO).not.toMatch(/onError: \(err: Error\) => Alert\.alert\('Error', err\.message\)/);
  });
});

describe('Phase E CRIT-109 — certifications.tsx replaces paste-URL with real picker+upload', () => {
  it('CRIT-109 — imports expo-image-picker', () => {
    expect(CERTIFICATIONS).toMatch(/from ['"]expo-image-picker['"]/);
  });
  it('CRIT-109 — imports uploadImages', () => {
    expect(CERTIFICATIONS).toMatch(/import \{ uploadImages \} from ['"]@\/services\/upload\.service['"]/);
  });
  it('CRIT-109 — Certificate Image URL TextInput removed', () => {
    expect(CERTIFICATIONS).not.toMatch(/placeholder=["']Certificate Image URL["']/);
  });
  it('CRIT-109 — uploads picked photo before POST', () => {
    expect(CERTIFICATIONS).toMatch(/uploadImages\(\[pendingLocalUri\], ['"]onboarding['"]\)/);
  });
  it('CRIT-109 — picker UI exposes both camera and gallery', () => {
    // Camera capture goes through the web-aware helper (utils/image-capture)
    // so the same button works in desktop/tablet browsers; gallery still
    // calls expo-image-picker directly.
    expect(CERTIFICATIONS).toMatch(/captureImageAsync/);
    expect(CERTIFICATIONS).toMatch(/launchImageLibraryAsync/);
  });
  it('CRIT-109 — uses canonical getErrorMessage', () => {
    expect(CERTIFICATIONS).toMatch(/import \{ getErrorMessage \} from/);
    expect(CERTIFICATIONS).not.toMatch(/onError: \(err: Error\) => Alert\.alert\('Error', err\.message\)/);
  });
  // The former raw-URL preview contract was intentionally superseded by
  // Bug UX-100. Its rendered test proves an existing private document is
  // represented as “on file” without placing the storage URL in the UI.
});
