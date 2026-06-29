/**
 * D27 Phase 2 — per-subcategory structured intake fields.
 *
 * Admins define typed questions per subcategory (measurements, color codes,
 * brand, "do you already have the part", choices, etc.). The customer's
 * job-request form renders them dynamically and stores answers as JSONB on the
 * booking; providers see the answers so they can quote accurately. Additive:
 * nothing about existing fixed-price / free-text flows changes.
 */
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export type IntakeFieldType = 'number' | 'text' | 'choice' | 'boolean';

interface IntakeFieldRow {
  id: string;
  subcategory_id: string;
  field_key: string;
  label: string;
  help_text: string | null;
  field_type: string;
  unit: string | null;
  options: string[] | null;
  placeholder: string | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface IntakeFieldInput {
  fieldKey: string;
  label: string;
  helpText?: string | null;
  fieldType: IntakeFieldType;
  unit?: string | null;
  options?: string[] | null;
  placeholder?: string | null;
  isRequired?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

function formatField(r: IntakeFieldRow): Record<string, unknown> {
  return {
    id: r.id,
    subcategoryId: r.subcategory_id,
    fieldKey: r.field_key,
    label: r.label,
    helpText: r.help_text,
    fieldType: r.field_type,
    unit: r.unit,
    options: r.options ?? null,
    placeholder: r.placeholder,
    isRequired: r.is_required,
    sortOrder: r.sort_order,
    isActive: r.is_active,
  };
}

/** List a subcategory's intake fields. `activeOnly` for the customer-facing form. */
export async function listIntakeFields(
  subcategoryId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  const where = opts.activeOnly ? 'AND is_active = TRUE' : '';
  const result = await db.query<IntakeFieldRow>(
    `SELECT * FROM subcategory_intake_fields
      WHERE subcategory_id = $1 ${where}
      ORDER BY sort_order ASC, created_at ASC`,
    [subcategoryId],
  );
  return result.rows.map(formatField);
}

function normalizeOptions(fieldType: IntakeFieldType, options?: string[] | null): string[] | null {
  if (fieldType !== 'choice') return null;
  const cleaned = (options ?? []).map((o) => String(o).trim()).filter(Boolean);
  if (cleaned.length < 2) {
    throw createAppError('A choice field needs at least 2 options.', 400);
  }
  return cleaned;
}

export async function createIntakeField(
  subcategoryId: string,
  input: IntakeFieldInput,
): Promise<Record<string, unknown>> {
  const options = normalizeOptions(input.fieldType, input.options);
  try {
    const result = await db.query<IntakeFieldRow>(
      `INSERT INTO subcategory_intake_fields
         (subcategory_id, field_key, label, help_text, field_type, unit, options,
          placeholder, is_required, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
       RETURNING *`,
      [
        subcategoryId,
        input.fieldKey.trim(),
        input.label.trim(),
        input.helpText ?? null,
        input.fieldType,
        input.unit ?? null,
        options ? JSON.stringify(options) : null,
        input.placeholder ?? null,
        input.isRequired ?? false,
        input.sortOrder ?? 0,
        input.isActive ?? true,
      ],
    );
    logger.info('Intake field created', { subcategoryId, fieldKey: input.fieldKey });
    return formatField(result.rows[0]!);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw createAppError(`A field with key "${input.fieldKey}" already exists for this service.`, 409);
    }
    if ((err as { code?: string }).code === '23503') {
      throw createAppError('Subcategory not found.', 404);
    }
    throw err;
  }
}

export async function updateIntakeField(
  fieldId: string,
  input: Partial<IntakeFieldInput>,
): Promise<Record<string, unknown>> {
  // Resolve the effective field_type to validate options correctly.
  const existing = await db.query<IntakeFieldRow>(
    `SELECT * FROM subcategory_intake_fields WHERE id = $1`,
    [fieldId],
  );
  const row = existing.rows[0];
  if (!row) throw createAppError('Intake field not found.', 404);

  const fieldType = (input.fieldType ?? row.field_type) as IntakeFieldType;
  const options =
    input.options !== undefined || input.fieldType !== undefined
      ? normalizeOptions(fieldType, input.options ?? row.options)
      : undefined;

  const result = await db.query<IntakeFieldRow>(
    `UPDATE subcategory_intake_fields SET
       label = COALESCE($2, label),
       help_text = COALESCE($3, help_text),
       field_type = COALESCE($4, field_type),
       unit = COALESCE($5, unit),
       options = COALESCE($6::jsonb, options),
       placeholder = COALESCE($7, placeholder),
       is_required = COALESCE($8, is_required),
       sort_order = COALESCE($9, sort_order),
       is_active = COALESCE($10, is_active),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      fieldId,
      input.label ?? null,
      input.helpText ?? null,
      input.fieldType ?? null,
      input.unit ?? null,
      options !== undefined && options !== null ? JSON.stringify(options) : null,
      input.placeholder ?? null,
      input.isRequired ?? null,
      input.sortOrder ?? null,
      input.isActive ?? null,
    ],
  );
  return formatField(result.rows[0]!);
}

export async function deleteIntakeField(fieldId: string): Promise<void> {
  const result = await db.query(`DELETE FROM subcategory_intake_fields WHERE id = $1`, [fieldId]);
  if (result.rowCount === 0) throw createAppError('Intake field not found.', 404);
  logger.info('Intake field deleted', { fieldId });
}
