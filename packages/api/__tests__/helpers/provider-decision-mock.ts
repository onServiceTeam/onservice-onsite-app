// Only fixtures for pre-existing narrow service-mock tests. Real transaction,
// migration, immutable-history and concurrency coverage lives in OPS-512..515.
export const mockRevisionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export function mockRevision(front: string, back: string, nbi: string, selfie: string) {
  return { rows: [{ id: mockRevisionId, decided: false, government_id_front_key: front,
    government_id_back_key: back, nbi_clearance_key: nbi, selfie_key: selfie }], rowCount: 1 };
}
