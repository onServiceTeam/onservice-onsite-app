/** In-memory ownership for async requests, separate from startup-read ordering.
 * This does not revoke server sessions or serialize browser cookie responses.
 */
let currentSession = {};

export class AdminSessionChangedError extends Error {
  constructor() {
    super('Your administrator sign-in changed. This request was stopped. Check the current record before trying again.');
    this.name = 'AdminSessionChangedError';
  }
}

export function captureAdminRequestSession(): object {
  return currentSession;
}

export function retireAdminRequestSession(): void {
  currentSession = {};
}

export function isAdminRequestSessionCurrent(session: object): boolean {
  return session === currentSession;
}

export function assertAdminRequestSession(session: object, signal?: RequestInit['signal']): void {
  if (signal?.aborted) {
    throw signal.reason ?? Object.assign(new Error('Request cancelled.'), { name: 'AbortError' });
  }
  if (session !== currentSession) throw new AdminSessionChangedError();
}
