// Phase 14 Dispatch 07 — migration 079 smoke test.
// Bugs 36, 37, 461, 1224, 73, 943, 944 — booking photos + signatures.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../migrations/079_d07_booking_photos_signatures.sql',
);

let sql: string;

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf8');
});

describe('Bug 36 + 461 + 1224 — booking_photos table', () => {
  it('creates booking_photos with booking_id FK', () => {
    expect(sql).toMatch(/CREATE TABLE booking_photos[\s\S]*booking_id UUID NOT NULL REFERENCES bookings\(id\) ON DELETE CASCADE/);
  });

  it('photo_type CHECK includes before/during/after/issue/checklist/identity/portfolio', () => {
    expect(sql).toMatch(/'before'/);
    expect(sql).toMatch(/'during'/);
    expect(sql).toMatch(/'after'/);
    expect(sql).toMatch(/'issue'/);
    expect(sql).toMatch(/'checklist'/);
    expect(sql).toMatch(/'identity'/);
    expect(sql).toMatch(/'portfolio'/);
  });

  it('uploaded_by_role CHECK enforces customer/provider/admin', () => {
    expect(sql).toMatch(/CHECK \(uploaded_by_role IN \('customer', 'provider', 'admin'\)\)/);
  });

  it('storage_key column is the S3 key (NOT a file:// URI)', () => {
    expect(sql).toMatch(/storage_key TEXT NOT NULL/);
    expect(sql).toMatch(/storage_url TEXT/);
  });

  it('soft-delete columns for retention + admin moderation', () => {
    expect(sql).toMatch(/deleted_at TIMESTAMPTZ/);
    expect(sql).toMatch(/deleted_by UUID REFERENCES users\(id\) ON DELETE SET NULL/);
    expect(sql).toMatch(/deleted_reason TEXT/);
  });

  it('partial index on (booking_id, photo_type) WHERE deleted_at IS NULL', () => {
    expect(sql).toMatch(/CREATE INDEX idx_booking_photos_booking_type[\s\S]*WHERE deleted_at IS NULL/);
  });

  it('index on (uploaded_by, uploaded_at DESC) for uploader history', () => {
    expect(sql).toMatch(/CREATE INDEX idx_booking_photos_uploader[\s\S]*uploaded_by, uploaded_at DESC/);
  });
});

describe('Bug 461 — booking_checklist_items.photo_id FK (deferred from 078)', () => {
  it('adds FK from booking_checklist_items.photo_id → booking_photos(id)', () => {
    expect(sql).toMatch(/ALTER TABLE booking_checklist_items[\s\S]*ADD CONSTRAINT booking_checklist_items_photo_fk[\s\S]*FOREIGN KEY \(photo_id\) REFERENCES booking_photos\(id\) ON DELETE SET NULL/);
  });
});

describe('Bug 37 — booking_signatures table', () => {
  it('creates booking_signatures with optional booking_id (IC agreements not booking-bound)', () => {
    expect(sql).toMatch(/CREATE TABLE booking_signatures[\s\S]*booking_id UUID REFERENCES bookings\(id\) ON DELETE CASCADE/);
    // Inside the booking_signatures table specifically, booking_id is nullable.
    // (booking_photos is separate and has booking_id NOT NULL — that's correct.)
    const sigBlock = /CREATE TABLE booking_signatures \([\s\S]*?\);/.exec(sql);
    expect(sigBlock).not.toBeNull();
    expect(sigBlock![0]).toMatch(/booking_id UUID REFERENCES bookings/);
    expect(sigBlock![0]).not.toMatch(/booking_id UUID NOT NULL REFERENCES bookings/);
  });

  it('signature_type CHECK includes ic_agreement + customer_acceptance + work_authorization + change_order_accept', () => {
    expect(sql).toMatch(/'ic_agreement'/);
    expect(sql).toMatch(/'customer_acceptance'/);
    expect(sql).toMatch(/'work_authorization'/);
    expect(sql).toMatch(/'change_order_accept'/);
  });

  it('storage_key holds the S3 key for the PNG bitmap', () => {
    expect(sql).toMatch(/storage_key TEXT NOT NULL/);
  });

  it('captures full_name_typed alongside bitmap (audit trail)', () => {
    expect(sql).toMatch(/full_name_typed TEXT/);
  });

  it('captures signing context (ip_address, user_agent)', () => {
    expect(sql).toMatch(/ip_address INET/);
    expect(sql).toMatch(/user_agent TEXT/);
  });

  it('one IC agreement per provider (unique partial index)', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX idx_booking_signatures_ic_per_provider[\s\S]*WHERE signature_type = 'ic_agreement' AND deleted_at IS NULL/);
  });

  it('soft-delete columns on booking_signatures', () => {
    const sigBlock = /CREATE TABLE booking_signatures \([\s\S]*?\);/.exec(sql);
    expect(sigBlock).not.toBeNull();
    expect(sigBlock![0]).toMatch(/deleted_at TIMESTAMPTZ/);
    expect(sigBlock![0]).toMatch(/deleted_by UUID REFERENCES users\(id\)/);
  });
});

describe('migration 079 — file presence and structure', () => {
  it('file exists and is non-empty', () => {
    expect(sql.length).toBeGreaterThan(500);
  });

  it('references the correct dispatch in comments', () => {
    expect(sql).toMatch(/Phase 14 Dispatch 07/i);
  });

  it('runs in a transaction', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });
});
