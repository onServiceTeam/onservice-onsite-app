import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { runInThisContext } from 'node:vm';

// Use Node's real fetch/streams/abort implementation, also inside jsdom. Only
// the endpoint and platform/storage boundaries are fixtures, not HTTP responses.
export function installNativeHttp(): () => void {
  const native = runInThisContext('({fetch, Headers, FormData, AbortController})') as
    Pick<typeof globalThis, 'fetch' | 'Headers' | 'FormData' | 'AbortController'>;
  const originals = Object.getOwnPropertyDescriptors(globalThis);
  for (const [name, value] of Object.entries(native)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  return () => {
    for (const name of Object.keys(native)) {
      const original = originals[name];
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
  };
}

interface ApiEndpoint {
  origin: string;
  requests: { url?: string; method?: string; body: string }[];
  closedResponses: () => number;
  close: () => Promise<void>;
}

export async function openApiEndpoint(
  reply: (response: ServerResponse, request: IncomingMessage) => void,
): Promise<ApiEndpoint> {
  const requests: { url?: string; method?: string; body: string }[] = [];
  let closed = 0;
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    response.on('close', () => { closed++; });
    request.on('end', () => {
      requests.push({ url: request.url, method: request.method, body });
      reply(response, request);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing owned API fixture listener');
  return {
    origin: `http://127.0.0.1:${address.port}`, requests,
    closedResponses: () => closed,
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

export async function observe(pending: Promise<unknown>, ms = 18_000): Promise<string> {
  const observer = new AbortController();
  try {
    return await Promise.race([
      pending.then(() => 'fulfilled', (error: unknown) =>
        (error as { name?: string })?.name ?? 'unknown_error'),
      delay(ms, 'observer_deadline', { signal: observer.signal }),
    ]);
  } finally { observer.abort(); }
}

export async function waitForPeer(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt++) await delay(10);
  if (!predicate()) throw new Error('Owned HTTP fixture did not reach the expected state');
}
