import http, { type ServerResponse } from 'node:http';
import { once } from 'node:events';

export const smsPhone = '+639170000000';
export const smsKey = 'privatekey731906';
export const smsCode = '048291';
export const smsReceipt = { message_id: 123, recipient: smsPhone.slice(1), status: 'Pending' };
const nativeFetch = globalThis.fetch;

// Each call owns a new loopback origin. Never replace native fetch parsing,
// streams, redirects, aborts or serialization, and never contact the provider.
export async function openSmsEndpoint(reply: (response: ServerResponse) => void) {
  const requests: { method?: string; body: string }[] = [];
  let closedResponses = 0;
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    response.on('close', () => { closedResponses++; });
    request.on('end', () => {
      requests.push({ method: request.method, body });
      reply(response);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing owned SMS fixture listener');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    closedResponses: () => closedResponses,
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

export async function withSmsProvider<T>(
  reply: (response: ServerResponse) => void,
  run: (endpoint: Awaited<ReturnType<typeof openSmsEndpoint>>) => Promise<T>,
): Promise<T> {
  const endpoint = await openSmsEndpoint(reply);
  const originalKey = process.env.SEMAPHORE_API_KEY;
  process.env.SEMAPHORE_API_KEY = smsKey;
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    if (url !== 'https://api.semaphore.co/api/v4/messages') throw new Error('Unexpected SMS destination');
    return nativeFetch(`${endpoint.origin}/messages`, init);
  });
  try {
    return await run(endpoint);
  } finally {
    fetchSpy.mockRestore();
    if (originalKey === undefined) delete process.env.SEMAPHORE_API_KEY;
    else process.env.SEMAPHORE_API_KEY = originalKey;
    await endpoint.close();
  }
}
