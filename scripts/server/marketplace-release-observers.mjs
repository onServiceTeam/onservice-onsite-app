// Fixed-target, read-only marketplace integration. No release acceptance,
// image activation, migrations, checkout changes or shared-service restarts.
import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { inspectReleaseDirectory } from './paired-web-release.mjs';
import { createObservedWebVerifier, readServedWebFile } from './served-web-files.mjs';

const exec = promisify(execFile);
const fail = message => { throw new Error(message); };
const roots = {
  admin: { host: '/opt/onservice/apps/admin/dist', container: '/usr/share/nginx/admin', hostname: 'admin.onservice.ph' },
  web: { host: '/opt/onservice/apps/mobile/dist-web', container: '/usr/share/nginx/app', hostname: 'app.onservice.ph' },
};
const fields = ['.Id', '.Name', '.Image', '.State.Running', '.State.Restarting', '.State.StartedAt',
  '.Config.Labels', '.Mounts', '.NetworkSettings.Ports'];

async function runLocalDocker(args) {
  if (process.platform !== 'linux') fail('Marketplace host observation requires the verified Linux host');
  try {
    const result = await exec('/usr/bin/sudo', ['-n', '/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', ...args], {
      encoding: 'utf8', timeout: 20000, maxBuffer: 128 * 1024,
      env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' },
    });
    return result.stdout;
  } catch { fail('Read-only local Docker command failed'); }
}

export function validateMarketplaceContainer(record, service) {
  if (!['nginx', 'api'].includes(service) || !/^[a-f0-9]{64}$/.test(record.id) ||
      record.name !== `/onservice-${service}-1` || !/^sha256:[a-f0-9]{64}$/.test(record.imageId) ||
      record.running !== true || record.restarting !== false || !Number.isFinite(Date.parse(record.startedAt)) ||
      record.labels?.['com.docker.compose.project'] !== 'onservice' ||
      record.labels?.['com.docker.compose.service'] !== service) fail('Unexpected marketplace container identity');
  if (service !== 'nginx') return;
  const binding = record.ports?.['443/tcp'];
  if (!Array.isArray(binding) || binding.length !== 1 || binding[0].HostIp !== '127.0.0.1' || binding[0].HostPort !== '8443') {
    fail('Unexpected marketplace nginx HTTPS binding');
  }
  if (!Array.isArray(record.mounts)) fail('Missing nginx mount inventory');
  for (const target of Object.values(roots)) {
    const mounts = record.mounts.filter(mount => mount.Destination === target.container ||
      mount.Destination?.startsWith(`${target.container}/`));
    if (mounts.length !== 1 || mounts[0].Type !== 'bind' || mounts[0].Source !== target.host ||
        mounts[0].Destination !== target.container || mounts[0].RW !== false) fail('Unexpected or shadowed marketplace web mount');
  }
  const config = record.mounts.filter(mount => mount.Destination === '/etc/nginx/nginx.conf');
  if (config.length !== 1 || config[0].Type !== 'bind' || config[0].Source !== '/opt/onservice/nginx/nginx.conf' ||
      config[0].RW !== false) fail('Unexpected marketplace nginx configuration mount');
}

export function createMarketplaceReleaseObservers({ runDocker = runLocalDocker } = {}) {
  // Transport injection is for fixtures. Production callers use no options.
  // Targets, daemon, commands, TLS policy and scope have no release-time overrides.
  if (typeof runDocker !== 'function') fail('Invalid read-only Docker transport');
  async function inspect(service) {
    const output = await runDocker(['inspect', '--format', fields.map(field => `{{json ${field}}}`).join('\n'), `onservice-${service}-1`]);
    const rows = output.trim().split(/\r?\n/).map(row => JSON.parse(row));
    if (rows.length !== fields.length) fail('Incomplete container inspection');
    const [id, name, imageId, running, restarting, startedAt, labels, mounts, ports] = rows;
    const record = { id, name, imageId, running, restarting, startedAt, labels, mounts, ports };
    validateMarketplaceContainer(record, service);
    if (!Array.isArray(mounts) || mounts.some(mount => !mount || typeof mount.Destination !== 'string')) {
      fail('Invalid container mount inventory');
    }
    // Docker may emit the same mount set in a different order on each inspect.
    // Sort only this unordered inventory; retain every mount field for equality.
    record.mounts = mounts.slice().sort((left, right) => left.Destination < right.Destination ? -1 : left.Destination > right.Destination ? 1 : 0);
    return record;
  }
  async function mountedHash(id, name) {
    const output = (await runDocker(['exec', id, 'sha256sum', '--', name])).trim();
    const expectedSuffix = `  ${name}`;
    if (!/^[a-f0-9]{64}/.test(output) || output.slice(64) !== expectedSuffix) fail('Invalid mounted-file hash response');
    return output.slice(0, 64);
  }
  async function inspectNginx() {
    const record = await inspect('nginx');
    const observedRoots = {};
    for (const [kind, target] of Object.entries(roots)) {
      const actual = await inspectReleaseDirectory(target.host);
      const mounted = (await runDocker(['exec', record.id, 'stat', '-c', '%d %i', target.container])).trim();
      if (mounted !== `${actual.dev} ${actual.ino}`) fail('nginx is attached to a different directory inode');
      observedRoots[kind] = actual;
    }
    const configurationSha256 = await mountedHash(record.id, '/etc/nginx/nginx.conf');
    const after = await inspect('nginx');
    if (!isDeepStrictEqual(after, record)) fail('nginx changed during host inspection');
    return { containerId: record.id, imageId: record.imageId, startedAt: record.startedAt,
      configurationSha256, localPort: 8443, roots: observedRoots };
  }
  const verifyServedFiles = createObservedWebVerifier({
    inspectNginx,
    hashMountedFile: (snapshot, kind, file) => mountedHash(snapshot.containerId, `${roots[kind].container}/${file.name}`),
    readFile: async (snapshot, kind, file) => {
      // Verify both the exact local nginx TLS endpoint and public ingress. The
      // public check must not inherit the loopback override or a test CA.
      const hostname = roots[kind].hostname;
      await readServedWebFile({ hostname, address: '127.0.0.1', port: snapshot.localPort }, file);
      return readServedWebFile({ hostname, port: 443 }, file);
    },
  });
  async function inspectApi() {
    const record = await inspect('api');
    let ready;
    try {
      // Ignore container-local curl configuration and proxies. This must be
      // the container's loopback readiness endpoint without injected headers.
      const payload = JSON.parse(await runDocker(['exec', record.id, 'curl', '--disable', '--noproxy', '*', '--fail', '--silent', '--show-error',
        '--max-time', '10', 'http://127.0.0.1:7381/health/ready']));
      ready = payload.status === 'ready' && payload.checks?.postgres === 'ok' && payload.checks?.redis === 'ok';
    } catch { ready = false; }
    const after = await inspect('api');
    if (!isDeepStrictEqual(after, record)) fail('API container changed during readiness observation');
    return { containerId: record.id, imageId: record.imageId, ready };
  }
  return { inspectNginx, verifyServedFiles, inspectApi };
}
