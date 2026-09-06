/** In-memory ownership for async requests, separate from startup-read ordering.
 * This does not revoke server sessions or serialize browser cookie responses.
 */
let currentSession = {};
const passwordRotationListeners = new Set<() => void>();

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

/** Keep transport independent of the auth store while reporting a current
 * server requirement. This does not mint a session or clear a requirement.
 */
export function subscribeAdminPasswordRotationRequired(listener: () => void): () => void {
  passwordRotationListeners.add(listener);
  return () => { passwordRotationListeners.delete(listener); };
}

export function reportAdminPasswordRotationRequired(session: object): void {
  assertAdminRequestSession(session);
  for (const listener of passwordRotationListeners) listener();
}
