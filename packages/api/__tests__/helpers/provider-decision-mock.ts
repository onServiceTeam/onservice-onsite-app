// Only fixtures for pre-existing narrow service-mock tests. Real transaction,
// migration, immutable-history and concurrency coverage lives in OPS-512..515.
export const mockRevisionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export function mockRevision(front: string, back: string, nbi: string, selfie: string) {
  return { rows: [{ id: mockRevisionId, decided: false, government_id_front_key: front,
    government_id_back_key: back, nbi_clearance_key: nbi, selfie_key: selfie }], rowCount: 1 };
}

// Only account/provider rows for legacy SQL-mock fixtures. Lock concurrency is
// exercised on real PostgreSQL by OPS-518/519, not asserted from these strings.
export function mockDecisionLocks(sql: string, ownerId: string) {
  if (sql.includes('SELECT u.id FROM users u')) return { rows: [{ id: ownerId }], rowCount: 1 };
  if (sql === 'SELECT user_id FROM providers WHERE id = $1 FOR UPDATE') {
    return { rows: [{ user_id: ownerId }], rowCount: 1 };
  }
  return undefined;
}
