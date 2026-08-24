import { spawnSync } from 'child_process';
import { resolve } from 'path';

describe('production Redis queue durability', () => {
  it('Bug UX197 — resolved compose config refuses writes instead of evicting BullMQ keys', () => {
    const composeFile = resolve(__dirname, '../../..', 'docker-compose.prod.yml');
    const result = spawnSync(
      'docker',
      ['compose', '-f', composeFile, 'config', '--format', 'json', '--no-interpolate'],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    const config = JSON.parse(result.stdout) as {
      services: { redis: { command: string | string[] } };
    };
    const command = Array.isArray(config.services.redis.command)
      ? config.services.redis.command.join(' ')
      : config.services.redis.command;

    expect(command).toContain('--maxmemory-policy noeviction');
    expect(command).not.toContain('allkeys-lru');
  });
});
