// D24 Option A (address search) test helper: a small in-memory stand-in for
// the ioredis commands the address search code uses (get, set with EX, del,
// incr, decr, expire, ttl, and multi().incr().expire().exec()). Expiry follows
// Date.now(), so jest fake timers or a Date.now spy move it.
//
// Failures, to test the fail-closed paths:
//   - `failing = true` makes every command reject (Redis down);
//   - `failOn.add('incr')` makes only the named commands reject (for example
//     a Redis at its memory limit with noeviction: reads work, INCR fails);
//   - `hangOn.add('get')` makes the named commands never answer, as the
//     shared client does while it queues commands during a reconnect.
// A MULTI whose queued commands include a failing one rejects at exec() and
// applies none of them, as Redis does when it refuses a command at queue
// time (EXECABORT, for example an INCR refused for lack of memory). Not a
// general Redis fake.

type Command = 'get' | 'set' | 'del' | 'incr' | 'decr' | 'expire' | 'ttl' | 'multi' | 'exec';

export interface FakeMulti {
  incr(key: string): FakeMulti;
  expire(key: string, seconds: number): FakeMulti;
  exec(): Promise<[Error | null, unknown][]>;
}

export class FakeRedis {
  private readonly values = new Map<string, { value: string; expiresAt: number | null }>();
  failing = false;
  readonly failOn = new Set<Command>();
  readonly hangOn = new Set<Command>();
  readonly calls: string[] = [];

  private live(key: string): { value: string; expiresAt: number | null } | undefined {
    const entry = this.values.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return undefined;
    }
    return entry;
  }

  private refuses(command: Command): boolean {
    return this.failing || this.failOn.has(command);
  }

  /** Record the command, then hang (hangOn) or reject (failing, failOn) as configured. */
  private async gate(command: Command): Promise<void> {
    this.calls.push(command);
    if (this.hangOn.has(command)) await new Promise<never>(() => undefined);
    if (this.refuses(command)) throw new Error('fake redis is down');
  }

  on(): this { return this; }

  async get(key: string): Promise<string | null> {
    await this.gate('get');
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, mode?: string, seconds?: number): Promise<'OK'> {
    await this.gate('set');
    const expiresAt = mode === 'EX' && typeof seconds === 'number' ? Date.now() + seconds * 1000 : null;
    this.values.set(key, { value: String(value), expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    await this.gate('del');
    let removed = 0;
    for (const key of keys) if (this.values.delete(key)) removed += 1;
    return removed;
  }

  private applyIncr(key: string, step: number): number {
    const entry = this.live(key);
    const next = Number(entry?.value ?? 0) + step;
    this.values.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return next;
  }

  private applyExpire(key: string, seconds: number): number {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async incr(key: string): Promise<number> {
    await this.gate('incr');
    return this.applyIncr(key, 1);
  }

  async decr(key: string): Promise<number> {
    await this.gate('decr');
    return this.applyIncr(key, -1);
  }

  async expire(key: string, seconds: number): Promise<number> {
    await this.gate('expire');
    return this.applyExpire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    await this.gate('ttl');
    const entry = this.live(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  /** MULTI with the two commands the address search counters queue. */
  multi(): FakeMulti {
    this.calls.push('multi');
    const queued: { command: Command; run: () => unknown }[] = [];
    const chain: FakeMulti = {
      incr: (key: string) => { queued.push({ command: 'incr', run: () => this.applyIncr(key, 1) }); return chain; },
      expire: (key: string, seconds: number) => { queued.push({ command: 'expire', run: () => this.applyExpire(key, seconds) }); return chain; },
      exec: async (): Promise<[Error | null, unknown][]> => {
        this.calls.push('exec', ...queued.map((item) => item.command));
        if (this.refuses('exec') || queued.some((item) => this.refuses(item.command))) {
          throw new Error('EXECABORT fake redis refused the transaction');
        }
        return queued.map((item) => [null, item.run()] as [Error | null, unknown]);
      },
    };
    return chain;
  }

  /** Test-side read that does not count as a command. */
  peek(key: string): string | null {
    return this.live(key)?.value ?? null;
  }

  /** Test-side expiry read, in seconds (-1 no expiry, -2 no key); not a command. */
  peekTtl(key: string): number {
    const entry = this.live(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  /** Every live key (test-side). */
  keys(): string[] {
    return [...this.values.keys()].filter((key) => this.live(key) !== undefined);
  }

  clear(): void {
    this.values.clear();
    this.calls.length = 0;
    this.failing = false;
    this.failOn.clear();
    this.hangOn.clear();
  }
}
