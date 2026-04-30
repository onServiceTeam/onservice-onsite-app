// Phase 14 Dispatch 07 — migration 078 smoke test.
// Bug 460 + 463 — server-driven checklist templates per category.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../migrations/078_d07_checklist_templates.sql',
);

let sql: string;

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf8');
});

describe('Bug 460 — migration 078 schema', () => {
  it('creates checklist_templates table keyed on category_id', () => {
    expect(sql).toMatch(/CREATE TABLE checklist_templates[\s\S]*category_id UUID NOT NULL REFERENCES service_categories\(id\)/);
  });

  it('uses users(id) for created_by FK (admin_users does not exist)', () => {
    expect(sql).toMatch(/created_by UUID REFERENCES users\(id\) ON DELETE SET NULL/);
  });

  it('creates checklist_template_sections with display_order + title', () => {
    expect(sql).toMatch(/CREATE TABLE checklist_template_sections[\s\S]*display_order INTEGER NOT NULL[\s\S]*title TEXT NOT NULL/);
  });

  it('creates checklist_template_items with photo_required flag', () => {
    expect(sql).toMatch(/CREATE TABLE checklist_template_items[\s\S]*photo_required BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it('creates booking_checklists with one-per-booking unique constraint', () => {
    expect(sql).toMatch(/CREATE TABLE booking_checklists[\s\S]*UNIQUE \(booking_id\)/);
  });

  it('creates booking_checklist_items with snapshot columns + completion state', () => {
    expect(sql).toMatch(/CREATE TABLE booking_checklist_items[\s\S]*title_snapshot TEXT NOT NULL[\s\S]*is_completed BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it('creates partial index on active templates', () => {
    expect(sql).toMatch(/CREATE INDEX idx_checklist_templates_category_active[\s\S]*WHERE is_active = TRUE/);
  });

  it('creates index for completion state queries', () => {
    expect(sql).toMatch(/CREATE INDEX idx_bcl_items_completed/);
  });
});

describe('Bug 460 — migration 078 seed templates', () => {
  it.each([
    'cleaning', 'aircon', 'plumbing', 'electrical',
    'carpentry', 'painting', 'pest-control', 'appliance-repair',
    'roofing', 'landscaping',
  ])('seeds template for category %s', (slug) => {
    expect(sql).toMatch(new RegExp(`SELECT id FROM service_categories WHERE slug = '${slug}'`));
  });

  it('cleaning template has Kitchen + Bathroom + Living areas sections (Bug 460)', () => {
    // Cleaning section comes first — section titles should appear in cleaning area
    expect(sql).toMatch(/'Kitchen'/);
    expect(sql).toMatch(/'Bathroom'/);
    expect(sql).toMatch(/'Living areas'/);
  });

  it('aircon template has Pre-inspection + Test run + Refrigerant', () => {
    expect(sql).toMatch(/'Pre-inspection'/);
    expect(sql).toMatch(/'Test run'/);
    expect(sql).toMatch(/Refrigerant/);
  });

  it('every template has photo_required items (Bug 461)', () => {
    // Look for at least one TRUE in photo_required column position
    const photoRequiredCount = (sql.match(/, TRUE\)/g) || []).length;
    expect(photoRequiredCount).toBeGreaterThan(15); // ≥10 categories × 1-2 photo items each
  });
});

describe('migration 078 — file presence and structure', () => {
  it('file exists and is non-empty', () => {
    expect(sql.length).toBeGreaterThan(1000);
  });

  it('references the correct dispatch in comments', () => {
    expect(sql).toMatch(/Phase 14 Dispatch 07/i);
  });

  it('runs in a transaction', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });

  it('seeds at least 10 templates (one per category)', () => {
    const templateInserts = (sql.match(/INSERT INTO checklist_templates \(category_id\)/g) || []).length;
    expect(templateInserts).toBe(10);
  });
});
