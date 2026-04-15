import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

interface AddressRow {
  id: string;
  user_id: string;
  label: string;
  full_address: string;
  barangay: string;
  city: string;
  province: string;
  region: string | null;
  zip_code: string | null;
  latitude: string | null;
  longitude: string | null;
  is_default: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CountRow { count: string }

interface CreateAddressParams {
  userId: string;
  label: string;
  fullAddress: string;
  barangay: string;
  city: string;
  province: string;
  region?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
  notes?: string;
}

const MAX_ADDRESSES_PER_USER = 10;

export async function getUserAddresses(userId: string): Promise<AddressRow[]> {
  const result = await db.query<AddressRow>(
    `SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function getAddressById(addressId: string, userId: string): Promise<AddressRow> {
  const result = await db.query<AddressRow>(
    `SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2`,
    [addressId, userId],
  );

  if (result.rows.length === 0) {
    throw createAppError('Address not found.', 404);
  }

  return result.rows[0]!;
}

export async function createAddress(params: CreateAddressParams): Promise<AddressRow> {
  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM user_addresses WHERE user_id = $1`,
    [params.userId],
  );

  if (Number(countResult.rows[0]?.count) >= MAX_ADDRESSES_PER_USER) {
    throw createAppError(`Maximum of ${MAX_ADDRESSES_PER_USER} saved addresses allowed.`, 400);
  }

  return db.transaction(async (client) => {
    if (params.isDefault) {
      await client.query(
        `UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1`,
        [params.userId],
      );
    }

    const isFirstAddress = Number(countResult.rows[0]?.count) === 0;
    const isDefault = params.isDefault ?? isFirstAddress;

    const result = await client.query<AddressRow>(
      `INSERT INTO user_addresses (user_id, label, full_address, barangay, city, province, region, zip_code, latitude, longitude, is_default, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        params.userId, params.label, params.fullAddress,
        params.barangay, params.city, params.province,
        params.region ?? null, params.zipCode ?? null,
        params.latitude ?? null, params.longitude ?? null,
        isDefault, params.notes ?? null,
      ],
    );

    logger.info('Address created', { userId: params.userId, addressId: result.rows[0]!.id });
    return result.rows[0]!;
  });
}

export async function updateAddress(
  addressId: string,
  userId: string,
  updates: Partial<Omit<CreateAddressParams, 'userId'>>,
): Promise<AddressRow> {
  await getAddressById(addressId, userId);

  return db.transaction(async (client) => {
    if (updates.isDefault) {
      await client.query(
        `UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1`,
        [userId],
      );
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      label: 'label', fullAddress: 'full_address', barangay: 'barangay',
      city: 'city', province: 'province', region: 'region',
      zipCode: 'zip_code', latitude: 'latitude', longitude: 'longitude',
      isDefault: 'is_default', notes: 'notes',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      const value = updates[key as keyof typeof updates];
      if (value !== undefined) {
        sets.push(`${col} = $${idx++}`);
        vals.push(value);
      }
    }

    if (sets.length === 0) {
      throw createAppError('No fields to update.', 400);
    }

    sets.push(`updated_at = NOW()`);
    vals.push(addressId, userId);

    const result = await client.query<AddressRow>(
      `UPDATE user_addresses SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      vals,
    );

    return result.rows[0]!;
  });
}

export async function deleteAddress(addressId: string, userId: string): Promise<void> {
  const address = await getAddressById(addressId, userId);
  const wasDefault = address.is_default;

  await db.query(`DELETE FROM user_addresses WHERE id = $1 AND user_id = $2`, [addressId, userId]);

  if (wasDefault) {
    await db.query(
      `UPDATE user_addresses SET is_default = TRUE
       WHERE id = (
         SELECT id FROM user_addresses
         WHERE user_id = $1
         ORDER BY created_at ASC
         LIMIT 1
       )`,
      [userId],
    );
  }

  logger.info('Address deleted', { userId, addressId });
}

export function formatAddress(row: AddressRow) {
  return {
    id: row.id,
    label: row.label,
    fullAddress: row.full_address,
    barangay: row.barangay,
    city: row.city,
    province: row.province,
    region: row.region,
    zipCode: row.zip_code,
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    isDefault: row.is_default,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
