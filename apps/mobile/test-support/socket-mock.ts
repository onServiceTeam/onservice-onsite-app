/**
 * D38 Milestone 2 test support (package P5b): a stand-in for
 * src/services/socket.service that lets a test play the live connection.
 *
 * Use with
 *   jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);
 *   import { socketMock } from '../test-support/socket-mock';
 *
 * socketMock.serve(event, payload) delivers a server event to every
 * listener the screen registered through subscribeSocketEvent;
 * socketMock.setConnected(true|false) flips the connection status the
 * polling hooks read. Call socketMock.reset() in afterEach.
 */
type Handler = (payload: unknown) => void;
type StatusListener = (connected: boolean) => void;

const handlers = new Map<string, Set<Handler>>();
const statusListeners = new Set<StatusListener>();
let connected = false;

export const socketMock = {
  serve(event: string, payload?: unknown): void {
    for (const handler of Array.from(handlers.get(event) ?? [])) handler(payload);
  },
  setConnected(next: boolean): void {
    connected = next;
    for (const listener of Array.from(statusListeners)) listener(next);
  },
  listenerCount(event: string): number {
    return handlers.get(event)?.size ?? 0;
  },
  reset(): void {
    handlers.clear();
    statusListeners.clear();
    connected = false;
  },
};

export const socketServiceMock = {
  subscribeSocketEvent(event: string, handler: Handler): () => void {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler);
    return () => { handlers.get(event)?.delete(handler); };
  },
  onSocketStatus(listener: StatusListener): () => void {
    statusListeners.add(listener);
    return () => { statusListeners.delete(listener); };
  },
  isSocketConnected(): boolean {
    return connected;
  },
  getSocket(): null {
    return null;
  },
  connectSocket(): null {
    return null;
  },
  disconnectSocket(): void {},
  joinConversation(): void {},
  leaveConversation(): void {},
  emitTypingStart(): void {},
  emitTypingStop(): void {},
  emitMarkRead(): void {},
};
