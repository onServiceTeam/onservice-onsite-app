// CR-252 (customer review 2026-10-17, slice P2, discovery-support-4):
// Service Provider profile privacy fix. The public catalog search matches a
// Service Provider by business name only. A search for the person's surname,
// or first name, finds no Service Provider; a search for the business name
// still does. Real public catalog router and real SQL on the guarded
// PostgreSQL fixture (the approved Service Provider is Ana Reyes, business
// "Linis Pro Cleaning Services").
import { approvedProvider, p2Http, p2It as it, withP2Database } from './helpers/p2-switches-postgres';
import catalogRouter from '../src/routes/catalog.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug CR-252 — public search finds a Service Provider by business name, never by the person\'s own name', async () => {
  await withP2Database(async () => {
    const http = p2Http([['/api/v1/catalog', catalogRouter]]);
    const providerIdsFor = async (q: string): Promise<string[]> => {
      const response = await http.get(`/api/v1/catalog/search?q=${encodeURIComponent(q)}`);
      expect({ q, status: response.status }).toEqual({ q, status: 200 });
      return (response.body.data.providers as Array<{ id: string }>).map((provider) => provider.id);
    };

    expect(await providerIdsFor('Reyes')).toEqual([]);
    expect(await providerIdsFor('ana reyes')).toEqual([]);
    expect(await providerIdsFor('Ana')).toEqual([]);
    expect(await providerIdsFor('Linis Pro')).toEqual([approvedProvider]);
    expect(await providerIdsFor('cleaning services')).toEqual([approvedProvider]);
  });
}, 90000);
