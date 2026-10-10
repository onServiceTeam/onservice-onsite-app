import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const safeDatabase = (() => {
  if (!databaseUrl || process.env.NODE_ENV !== 'test') return false;
  try {
    const parsed = new URL(databaseUrl);
    return ['localhost', '127.0.0.1'].includes(parsed.hostname)
      && parsed.pathname.replace(/^\//, '').endsWith('_test');
  } catch {
    return false;
  }
})();
if (process.env.CI && !safeDatabase) {
  throw new Error('OPS-331 requires the isolated localhost *_test PostgreSQL service in CI.');
}
const integrationIt = safeDatabase ? it : it.skip;
const migration = (name: string) => readFileSync(resolve(__dirname, '../../migrations', name), 'utf8');
const id = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;

integrationIt('Bug OPS-331 — migration 166 preserves populated legacy history and enforces controlled financial evidence in PostgreSQL', async () => {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  const schema = `ops331_${randomUUID().replaceAll('-', '')}`;
  let schemaCreated = false;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await client.query(`SET search_path TO "${schema}"`);
    // Unrelated referenced entities are minimal fixtures. Commercial tables
    // and their original constraints come from the actual 021/129 migrations.
    // UUID ordering is not under test; this schema-local helper supports PG17.
    await client.query(`
      CREATE FUNCTION uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
      CREATE TABLE users (id uuid PRIMARY KEY);
      CREATE TABLE providers (id uuid PRIMARY KEY);
      CREATE TABLE service_categories (id uuid PRIMARY KEY);
      CREATE TABLE service_subcategories (id uuid PRIMARY KEY);
      CREATE TABLE bookings (
        id uuid PRIMARY KEY, status text NOT NULL, total_amount bigint NOT NULL,
        notes text, customer_id uuid REFERENCES users(id), scheduled_at timestamptz
      );
      CREATE TABLE booking_financial_terms (id uuid PRIMARY KEY);
      CREATE TABLE platform_settings (
        key text PRIMARY KEY, category text, subcategory text, label text,
        description text, value_type text, value text, default_value text,
        display_order integer, is_active boolean
      );
      CREATE TABLE admin_actions (
        action_type varchar(100) NOT NULL,
        CONSTRAINT admin_actions_action_type_check CHECK (
          action_type::text = ANY (ARRAY[
            ('config_changed'::varchar)::text, ('booking_cancelled'::varchar)::text
          ])
        )
      );
    `);
    await client.query(migration('021_b2b_commercial.sql'));
    await client.query(migration('129_phase200_booking_contract_link.sql'));
    await client.query('INSERT INTO users VALUES ($1), ($2)', [id(1), id(2)]);
    await client.query('INSERT INTO service_categories VALUES ($1)', [id(10)]);
    for (const account of [20, 21]) {
      await client.query(`
        INSERT INTO business_accounts
          (id, company_name, business_type, billing_address, barangay, city, province,
           contact_person, contact_email, contact_phone, owner_user_id, status,
           volume_discount_rate, monthly_credit_limit)
        VALUES ($1, $2, 'office', 'Fixture address', 'Fixture barangay', 'Cebu', 'Cebu',
                'Fixture owner', 'billing@example.invalid', '+639000000001', $3,
                'active', 5.25, 2147483647)
      `, [id(account), `Fixture company ${account}`, id(1)]);
    }
    for (const [contract, account, rate, status] of [
      [30, 20, 250000, 'active'], [31, 21, 290000, 'active'], [32, 20, 0, 'expired'],
    ] as const) {
      await client.query(`
        INSERT INTO business_contracts
          (id, business_account_id, category_id, contract_type, agreed_rate,
           start_date, end_date, status, terms)
        VALUES ($1, $2, $3, 'on_demand', $4, '2026-01-01', $5, $6, 'Original signed terms')
      `, [id(contract), id(account), id(10), rate, contract === 32 ? '2025-12-01' : null, status]);
    }
    // Include personal work, a partial historical link and a cross-company
    // legacy mismatch. The migration must retain evidence, not guess a repair.
    for (const [booking, account, contract] of [
      [40, 20, 30], [41, null, null], [42, 20, null], [43, 20, 31],
    ] as const) {
      await client.query(`
        INSERT INTO bookings (id, status, total_amount, notes, customer_id,
                              business_account_id, contract_id)
        VALUES ($1, 'confirmed', 110000, 'Original booking note', $2, $3, $4)
      `, [id(booking), id(1), account === null ? null : id(account), contract === null ? null : id(contract)]);
    }
    for (const [invoice, account, status, amount] of [
      [50, 20, 'paid', 2000000000], [51, 21, 'sent', 900000000],
    ] as const) {
      await client.query(`
        INSERT INTO business_invoices
          (id, business_account_id, invoice_number, billing_period_start,
           billing_period_end, subtotal, total_amount, status, due_date,
           payment_reference, paid_at)
        VALUES ($1, $2, $3, '2026-07-01', '2026-07-31', $4, $4, $5, '2026-08-30',
                $6, $7)
      `, [id(invoice), id(account), `LEGACY-${invoice}`, amount, status,
        status === 'paid' ? 'legacy-external-reference' : null,
        status === 'paid' ? '2026-08-03T02:00:00Z' : null]);
    }
    await client.query(`
      INSERT INTO business_invoice_items (id, invoice_id, booking_id, description, unit_price, amount)
      VALUES ($1, $2, $3, 'Legacy personal-work inclusion', 2000000000, 2000000000),
             ($4, $5, $6, 'Legacy other-company inclusion', 900000000, 900000000)
    `, [id(60), id(50), id(41), id(61), id(51), id(40)]);
    await client.query(`INSERT INTO platform_settings (key, value)
      VALUES ('feature_flag.business_contract_booking_enabled', 'true')`);

    const legacyTables = ['bookings', 'business_accounts', 'business_contracts', 'business_invoices', 'business_invoice_items'];
    const legacy = new Map<string, Array<{ row: Record<string, unknown> }>>();
    for (const table of legacyTables) {
      const result = await client.query<{ row: Record<string, unknown> }>(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`);
      legacy.set(table, result.rows);
    }
    await client.query(migration('166_b2b_controlled_billing.sql'));
    for (const table of legacyTables) {
      const current = await client.query<{ row: Record<string, unknown> }>(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`);
      expect(current.rows).toHaveLength(legacy.get(table)!.length);
      for (const original of legacy.get(table)!) {
        expect(current.rows.find(item => item.row.id === original.row.id)?.row).toMatchObject(original.row);
      }
    }
    expect((await client.query('SELECT billing_mode FROM bookings')).rows)
      .toEqual(Array.from({ length: 4 }, () => ({ billing_mode: null })));
    expect((await client.query('SELECT control_state, settlement_state FROM business_invoices')).rows)
      .toEqual(Array.from({ length: 2 }, () => ({ control_state: 'legacy_unreviewed', settlement_state: 'legacy_unreviewed' })));
    expect((await client.query('SELECT published_at FROM business_contracts')).rows)
      .toEqual(Array.from({ length: 3 }, () => ({ published_at: null })));
    expect((await client.query('SELECT * FROM business_account_term_versions')).rows).toEqual([]);
    expect((await client.query("SELECT value FROM platform_settings WHERE key = 'feature_flag.business_contract_booking_enabled'")).rows)
      .toEqual([{ value: 'false' }]);

    // Unrelated support metadata on partially linked old bookings stays editable.
    expect((await client.query("UPDATE bookings SET notes = 'Reviewed support context' RETURNING id")).rowCount).toBe(4);
    const consumer = await client.query(`INSERT INTO bookings (id, status, total_amount)
      VALUES ($1, 'pending', 120000) RETURNING billing_mode`, [id(44)]);
    expect(consumer.rows).toEqual([{ billing_mode: 'consumer_prepay' }]);
    await expect(client.query(`INSERT INTO bookings (id, status, total_amount, business_account_id)
      VALUES ($1, 'pending', 120000, $2)`, [id(46), id(20)]))
      .rejects.toMatchObject({ code: '23514', constraint: 'bookings_business_link_complete' });

    for (const [terms, account, version, limit] of [[70, 20, 1, 3000000000], [71, 21, 1, 4000000000]] as const) {
      await client.query(`INSERT INTO business_account_term_versions
        (id, business_account_id, version, payment_terms, volume_discount_basis_points,
         monthly_credit_limit, effective_from, reason, created_by, approved_by)
        VALUES ($1, $2, $3, 'net_30', 500, $4, '2026-08-01', 'Approved fixture agreement', $5, $5)`,
      [id(terms), id(account), version, limit, id(2)]);
    }
    await client.query(`INSERT INTO business_contracts
      (id, business_account_id, category_id, contract_type, agreed_rate, start_date, status, published_at)
      VALUES ($1, $2, $3, 'on_demand', 3000000000, '2026-08-01', 'active', NOW())`, [id(33), id(20), id(10)]);
    const insertBooking = (booking: number, contract: number, terms: number) => client.query(`
      INSERT INTO bookings (id, status, total_amount, business_account_id, contract_id,
                            business_account_terms_version_id, billing_mode)
      VALUES ($1, 'confirmed', 3000000000, $2, $3, $4, 'business_terms')`,
    [id(booking), id(20), id(contract), id(terms)]);
    await insertBooking(45, 33, 70);
    await expect(insertBooking(46, 31, 70))
      .rejects.toMatchObject({ code: '23503', constraint: 'bookings_contract_belongs_to_business' });
    await expect(insertBooking(47, 33, 71))
      .rejects.toMatchObject({ code: '23503', constraint: 'bookings_terms_belong_to_business' });

    const insertInvoice = (invoice: number, account: number, terms: number | null) => client.query(`
      INSERT INTO business_invoices (id, business_account_id, invoice_number, billing_period_start,
        billing_period_end, subtotal, total_amount, due_date, status, control_state, settlement_state,
        account_terms_version_id)
      VALUES ($1, $2, $3, '2026-08-01', '2026-08-31', 3000000000, 3000000000,
              '2026-09-30', 'sent', 'controlled', 'open', $4)`,
    [id(invoice), id(account), `CONTROLLED-${invoice}`, terms === null ? null : id(terms)]);
    await insertInvoice(52, 20, 70);
    await insertInvoice(53, 21, 71);
    await expect(insertInvoice(54, 20, 70))
      .rejects.toMatchObject({ code: '23505', constraint: 'business_invoices_controlled_period_terms_unique' });
    await expect(insertInvoice(55, 20, 71))
      .rejects.toMatchObject({ code: '23503', constraint: 'business_invoices_terms_belong_to_business' });
    await expect(insertInvoice(56, 20, null))
      .rejects.toMatchObject({ code: '23514', constraint: 'business_invoices_controlled_terms_required' });
    await client.query(`INSERT INTO business_account_term_versions
      (id, business_account_id, version, payment_terms, volume_discount_basis_points,
       monthly_credit_limit, effective_from, reason, created_by, approved_by)
      VALUES ($1, $2, 2, 'net_15', 750, 4000000000, '2026-10-01', 'Later prospective terms', $3, $3)`,
    [id(72), id(20), id(2)]);
    await client.query('UPDATE business_accounts SET monthly_credit_limit = 4000000000 WHERE id = $1', [id(20)]);
    expect((await client.query('SELECT business_account_terms_version_id, total_amount::text FROM bookings WHERE id = $1', [id(45)])).rows)
      .toEqual([{ business_account_terms_version_id: id(70), total_amount: '3000000000' }]);
    expect((await client.query('SELECT account_terms_version_id, total_amount::text FROM business_invoices WHERE id = $1', [id(52)])).rows)
      .toEqual([{ account_terms_version_id: id(70), total_amount: '3000000000' }]);

    await client.query(`INSERT INTO business_invoice_items (id, invoice_id, booking_id, description, unit_price, amount)
      VALUES ($1, $2, $3, 'Controlled line', 3000000000, 3000000000)`, [id(62), id(52), id(45)]);
    const payment = (entry: number, invoice: number, amount: number, reference: string, reversal: number | null = null) => client.query(`
      INSERT INTO business_invoice_payments (id, invoice_id, entry_type, reverses_payment_id,
        amount, method, effective_at, external_reference, evidence_reference, reason, recorded_by, invoice_record_version)
      VALUES ($1, $2, $3, $4, $5, 'bank_transfer', '2026-09-05T01:00:00Z', $6,
              'fixture-evidence', 'Reconciled fixture entry', $7, 1)`,
    [id(entry), id(invoice), reversal === null ? 'payment' : 'reversal', reversal === null ? null : id(reversal),
      amount, reference, id(2)]);
    await payment(80, 52, 600000, 'Receipt-A');
    await payment(81, 52, 400000, 'Receipt-B');
    await payment(82, 52, 100000, 'Reversal-A', 80);
    await expect(payment(83, 53, 100000, 'Wrong-invoice-reversal', 80))
      .rejects.toMatchObject({ code: '23503', constraint: 'business_invoice_payment_reversal_same_invoice' });
    await expect(payment(84, 52, 100000, 'receipt-a'))
      .rejects.toMatchObject({ code: '23505', constraint: 'business_invoice_payments_reference_unique' });
    expect((await client.query(`SELECT SUM(CASE WHEN entry_type = 'payment' THEN amount ELSE -amount END)::text AS net
      FROM business_invoice_payments WHERE invoice_id = $1`, [id(52)])).rows).toEqual([{ net: '900000' }]);
    expect((await client.query('SELECT amount::text FROM business_invoice_payments WHERE id = $1', [id(80)])).rows)
      .toEqual([{ amount: '600000' }]);
    await client.query(`INSERT INTO business_invoice_adjustments
      (id, invoice_id, adjustment_type, amount, reason, evidence_reference, recorded_by, invoice_record_version)
      VALUES ($1, $2, 'credit', 100000, 'Approved fixture reduction', 'fixture-evidence', $3, 1)`,
    [id(90), id(52), id(2)]);
    await client.query(`INSERT INTO business_contract_events
      (id, business_account_id, contract_id, event_type, from_status, to_status,
       contract_record_version, reason, actor_id, snapshot)
      VALUES ($1, $2, $3, 'published', 'draft', 'active', 1, 'Approved fixture publication', $4, '{"rate":3000000000}')`,
    [id(91), id(20), id(33), id(2)]);

    for (const [table, rowId] of [
      ['business_account_term_versions', 70], ['business_contract_events', 91],
      ['business_invoice_items', 60], ['business_invoice_items', 62],
      ['business_invoice_adjustments', 90], ['business_invoice_payments', 80],
    ] as const) {
      const original = await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id = $1`, [id(rowId)]);
      expect(original.rowCount).toBe(1);
      await expect(client.query(`UPDATE ${table} SET id = id WHERE id = $1`, [id(rowId)]))
        .rejects.toMatchObject({ code: '55000' });
      await expect(client.query(`DELETE FROM ${table} WHERE id = $1`, [id(rowId)]))
        .rejects.toMatchObject({ code: '55000' });
      expect((await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id = $1`, [id(rowId)])).rows)
        .toEqual(original.rows);
    }
    await client.query("INSERT INTO admin_actions VALUES ('config_changed'), ('business_invoice_payment_recorded')");
    expect((await client.query('SELECT action_type FROM admin_actions ORDER BY action_type')).rows)
      .toEqual([{ action_type: 'business_invoice_payment_recorded' }, { action_type: 'config_changed' }]);
    await expect(client.query("INSERT INTO admin_actions VALUES ('unknown_action')"))
      .rejects.toMatchObject({ code: '23514' });
  } finally {
    try {
      // Roll back a failed migration before cleanup. Only this randomly named
      // test schema is removed; cleanup failure must not silently pass CI.
      if (schemaCreated) {
        await client.query('ROLLBACK');
        await client.query('RESET search_path');
        await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
    } finally {
      await client.end();
    }
  }
}, 30000);
