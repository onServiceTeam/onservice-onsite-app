/**
 * D38 Milestone 2 test support: a stand-in for a socket.io-client Socket.
 *
 * Use with
 *   const mockIo = jest.fn();
 *   jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
 *   mockIo.mockImplementation((url, options) => new FakeSocket(url, options));
 *
 * It records what the app does (listeners, emits, connect and disconnect
 * calls) and lets a test play the server: simulateConnect(), serve(event),
 * refuseHandshake(message), serverDisconnect().
 */
type Listener = (...args: unknown[]) => void;

export interface FakeSocketOptions {
  auth?: unknown;
  reconnectionAttempts?: number;
  transports?: string[];
  autoConnect?: boolean;
}

export class FakeSocket {
  connected = false;
  active = false;
  connectCalls = 0;
  disconnectCalls = 0;
  readonly emitted: Array<{ event: string; args: unknown[] }> = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(readonly url: string, readonly options: FakeSocketOptions) {}

  on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener?: Listener): this {
    if (!listener) this.listeners.delete(event);
    else this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    return this;
  }

  connect(): this {
    this.connectCalls += 1;
    this.active = true;
    return this;
  }

  disconnect(): this {
    this.disconnectCalls += 1;
    const wasConnected = this.connected;
    this.connected = false;
    this.active = false;
    if (wasConnected) this.trigger('disconnect', 'io client disconnect');
    return this;
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /** Run every listener the app attached for `event`. */
  trigger(event: string, ...args: unknown[]): void {
    for (const listener of Array.from(this.listeners.get(event) ?? [])) listener(...args);
  }

  /** The token the handshake would send right now (runs the auth callback). */
  handshakeToken(): unknown {
    const auth = this.options.auth;
    if (typeof auth === 'function') {
      let sent: unknown;
      (auth as (cb: (data: { token?: unknown }) => void) => void)((data) => { sent = data?.token; });
      return sent;
    }
    return (auth as { token?: unknown } | undefined)?.token;
  }

  /** The server accepted the handshake. */
  simulateConnect(): void {
    this.connected = true;
    this.active = true;
    this.trigger('connect');
  }

  /** A server event reaching the app. */
  serve(event: string, payload?: unknown): void {
    this.trigger(event, payload);
  }

  /** The server refused the handshake (middleware error); Socket.IO stops retrying. */
  refuseHandshake(message: string): void {
    this.connected = false;
    this.active = false;
    this.trigger('connect_error', new Error(message));
  }

  /** The server ended the connection (expired token, refused auth:refresh). */
  serverDisconnect(): void {
    this.connected = false;
    this.active = false;
    this.trigger('disconnect', 'io server disconnect');
  }
}
