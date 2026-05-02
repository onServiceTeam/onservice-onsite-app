// MED-N138 / MED-N139 — socket security: token expiry + rate limiting.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOCKET_SVC = readFileSync(
  resolve(__dirname, '../src/services/socket.service.ts'),
  'utf8',
);

// Strip // line comments so source-shape regexes don't match the comments.
function stripLineComments(src: string): string {
  return src
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

const SOCKET_NO_COMMENTS = stripLineComments(SOCKET_SVC);

describe('MED-N138 — socket JWT exp is re-checked, force-disconnect on expiry', () => {
  it('MED-N138 — AuthPayload includes exp', () => {
    expect(SOCKET_SVC).toMatch(/interface AuthPayload[\s\S]*?exp:\s*number/);
  });

  it('MED-N138 — handshake captures payload.exp onto socket.tokenExp', () => {
    expect(SOCKET_NO_COMMENTS).toMatch(/socket\.tokenExp\s*=\s*payload\.exp/);
  });

  it('MED-N138 — periodic interval checks socket.tokenExp and emits auth:expired then disconnects', () => {
    expect(SOCKET_NO_COMMENTS).toMatch(/setInterval/);
    expect(SOCKET_NO_COMMENTS).toMatch(/Date\.now\(\) \/ 1000 > exp/);
    expect(SOCKET_NO_COMMENTS).toMatch(/'auth:expired'/);
    expect(SOCKET_NO_COMMENTS).toMatch(/socket\.disconnect\(true\)/);
  });

  it('MED-N138 — disconnect handler clears the interval', () => {
    expect(SOCKET_NO_COMMENTS).toMatch(/clearInterval\(expCheck\)/);
  });
});

describe('MED-N139 — per-socket rate limit on send/typing/mark:read', () => {
  it('MED-N139 — checkRateLimit helper exists with sliding window + max events', () => {
    expect(SOCKET_NO_COMMENTS).toMatch(/function checkRateLimit/);
    expect(SOCKET_NO_COMMENTS).toMatch(/RATE_LIMIT_WINDOW_MS/);
    expect(SOCKET_NO_COMMENTS).toMatch(/RATE_LIMIT_MAX_EVENTS/);
  });

  it('MED-N139 — send:message gates on checkRateLimit', () => {
    const sendBlock = SOCKET_NO_COMMENTS.match(
      /socket\.on\('send:message'[\s\S]*?\}\);/,
    );
    expect(sendBlock).not.toBeNull();
    expect(sendBlock![0]!).toMatch(/checkRateLimit\(socket\)/);
  });

  it('MED-N139 — mark:read gates on checkRateLimit', () => {
    const markBlock = SOCKET_NO_COMMENTS.match(
      /socket\.on\('mark:read'[\s\S]*?\}\);/,
    );
    expect(markBlock).not.toBeNull();
    expect(markBlock![0]!).toMatch(/checkRateLimit\(socket\)/);
  });

  it('MED-N139 — typing:start and typing:stop gate on checkRateLimit (silent reject)', () => {
    const startBlock = SOCKET_NO_COMMENTS.match(
      /socket\.on\('typing:start'[\s\S]*?\}\);/,
    );
    const stopBlock = SOCKET_NO_COMMENTS.match(
      /socket\.on\('typing:stop'[\s\S]*?\}\);/,
    );
    expect(startBlock).not.toBeNull();
    expect(stopBlock).not.toBeNull();
    expect(startBlock![0]!).toMatch(/if \(!checkRateLimit\(socket\)\) return/);
    expect(stopBlock![0]!).toMatch(/if \(!checkRateLimit\(socket\)\) return/);
  });

  it('MED-N139 — join:conversation gates on checkRateLimit', () => {
    const joinBlock = SOCKET_NO_COMMENTS.match(
      /socket\.on\('join:conversation'[\s\S]*?\}\);/,
    );
    expect(joinBlock).not.toBeNull();
    expect(joinBlock![0]!).toMatch(/checkRateLimit\(socket\)/);
  });
});
