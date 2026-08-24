import { resolveDatabaseSsl } from '../src/config/database-ssl.config';

it('Bug OPS-203 — production supports only explicit internal plaintext or external TLS database transports', () => {
  expect(resolveDatabaseSsl({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:secret@pgbouncer:6432/onservice',
    DB_SSL_MODE: 'disable',
  })).toEqual({ mode: 'disable', ssl: false });

  expect(() => resolveDatabaseSsl({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:secret@database.example.net:5432/onservice',
    DB_SSL_MODE: 'disable',
  })).toThrow(/External database hosts must use require or verify-full/);

  expect(resolveDatabaseSsl({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:secret@database.example.net:5432/onservice',
    DB_SSL_MODE: 'require',
  })).toEqual({ mode: 'require', ssl: { rejectUnauthorized: false } });

  expect(resolveDatabaseSsl({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:secret@database.example.net:5432/onservice',
    DB_SSL_MODE: 'verify-full',
  })).toEqual({ mode: 'verify-full', ssl: { rejectUnauthorized: true } });

  expect(resolveDatabaseSsl({ NODE_ENV: 'development' })).toEqual({ mode: 'disable', ssl: false });
  expect(resolveDatabaseSsl({ NODE_ENV: 'production' })).toEqual({
    mode: 'verify-full',
    ssl: { rejectUnauthorized: true },
  });
});
