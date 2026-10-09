// Read-only artifact preflight, NOT authorization to publish or install an APK.
// No signing secrets, network access, app installation or generated-file edits.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const fail = message => { throw new Error(message); };
const hex = /^[a-f0-9]{64}$/i;
const abis = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'];
const versionCode = value => Number.isSafeInteger(value) && value > 0 && value <= 2100000000;

function validateExpected(expected) {
  const keys = ['packageName', 'versionName', 'versionCode', 'previousVersionCode', 'certificateSha256', 'requiredAbis'];
  if (!expected || Object.keys(expected).sort().join() !== keys.sort().join() ||
      typeof expected.packageName !== 'string' || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(expected.packageName) ||
      typeof expected.versionName !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,63}$/.test(expected.versionName) ||
      !versionCode(expected.versionCode) || !Number.isSafeInteger(expected.previousVersionCode) ||
      expected.previousVersionCode < 0 || expected.versionCode <= expected.previousVersionCode ||
      typeof expected.certificateSha256 !== 'string' || !hex.test(expected.certificateSha256) ||
      !Array.isArray(expected.requiredAbis) || expected.requiredAbis.length === 0 ||
      new Set(expected.requiredAbis).size !== expected.requiredAbis.length ||
      expected.requiredAbis.some(abi => !abis.includes(abi)) || !expected.requiredAbis.includes('arm64-v8a')) {
    fail('Invalid Android release expectation or non-increasing version code');
  }
}

function one(text, regex, message) {
  const matches = [...text.matchAll(regex)];
  if (matches.length !== 1) fail(message);
  return matches[0];
}

// SDK output is parsed as data. Never execute or echo manifest values or tool errors.
// Exported separately for deterministic policy tests; the CLI always runs real tools.
export function assessAndroidApk(observed, expected) {
  validateExpected(expected);
  const { badging, manifest, listing, signature } = observed;
  if ([badging, manifest, listing, signature].some(value => typeof value !== 'string' || !value.length || value.length > 8 * 1024 * 1024)) {
    fail('Incomplete or oversized Android tool evidence');
  }
  const pkg = one(badging, /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'.*$/gm, 'Missing or ambiguous APK identity');
  if (pkg[1] !== expected.packageName || Number(pkg[2]) !== expected.versionCode || pkg[3] !== expected.versionName) {
    fail('APK package or installed-version identity mismatch');
  }
  const developmentFlags = [...manifest.matchAll(/^\s*A: android:(?:debuggable|testOnly)\([^)]*\)=(.*)$/gm)];
  if (/^application-debuggable\s*$/m.test(badging) ||
      developmentFlags.some(match => match[1].trim() !== '(type 0x12)0x0')) {
    fail('Debuggable or test-only APK is not a release candidate');
  }
  if (/DEV_MISSING_|YOUR_(?:GOOGLE|EAS)|SYNTHETIC_RELEASE_PLACEHOLDER/i.test(manifest)) {
    fail('APK manifest contains development configuration');
  }
  one(manifest, /^\s*E: application \(line=\d+\)\s*$/gm, 'Missing or ambiguous APK application');
  one(badging, /^launchable-activity: name='([^']+)'.*$/gm, 'APK has no single launchable activity');
  const minimumSdk = Number(one(badging, /^sdkVersion:'(\d+)'\s*$/gm, 'Missing numeric minimum SDK')[1]);
  const targetSdk = Number(one(badging, /^targetSdkVersion:'(\d+)'\s*$/gm, 'Missing numeric target SDK')[1]);
  if (minimumSdk < 24 || targetSdk < minimumSdk) fail('Unexpected APK SDK range');
  const cert = one(signature, /^Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})\s*$/gim, 'Missing or ambiguous APK certificate')[1].toLowerCase();
  if (!/^Verifies\s*$/m.test(signature) || !/^Number of signers: 1\s*$/m.test(signature) ||
      !/^Verified using v[23] scheme .*: true\s*$/m.test(signature) ||
      cert !== expected.certificateSha256.toLowerCase() || /certificate DN:.*Android Debug/i.test(signature)) {
    fail('APK signature or pinned release identity mismatch');
  }
  const certificateRows = signature.match(/^Signer #\d+ certificate SHA-256 digest:/gm) ?? [];
  if (certificateRows.length !== 1) fail('Multiple APK signing identities require separate review');

  const rows = listing.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(?:Stored|Deflate)\s+\d+\s+-?\d+%\s+\d+\s+\S+\s+\S+\s+[a-f0-9]{8}\s+(.+)$/i);
    return match ? [{ size: Number(match[1]), name: match[2] }] : [];
  });
  const count = Number(one(listing, /^\s*\d+\s+\d+\s+-?\d+%\s+(\d+) files\s*$/gm, 'Missing archive inventory count')[1]);
  if (rows.length !== count || new Set(rows.map(row => row.name)).size !== rows.length ||
      rows.some(row => !Number.isSafeInteger(row.size) || row.size < 0 || row.name.startsWith('/') ||
        row.name.includes('\\') || row.name.split('/').includes('..'))) fail('Ambiguous APK archive inventory');
  for (const name of ['AndroidManifest.xml', 'classes.dex', 'assets/index.android.bundle']) {
    if (!rows.some(row => row.name === name && row.size > 0)) fail('APK is missing required embedded application content');
  }
  const nativeAbis = [...new Set(rows.flatMap(row => {
    const match = row.name.match(/^lib\/([^/]+)\/[^/]+\.so$/);
    return match && row.size > 0 ? [match[1]] : [];
  }))].sort();
  if (expected.requiredAbis.some(abi => !nativeAbis.includes(abi)) || nativeAbis.some(abi => !abis.includes(abi))) {
    fail('APK does not contain the required native architectures');
  }
  const declaredAbis = one(badging, /^native-code: (.+)$/gm, 'Missing native architecture declaration')[1]
    .trim().split(/\s+/).map(value => value.replace(/^'|'$/g, '')).sort();
  if (declaredAbis.join() !== nativeAbis.join()) fail('APK native architecture observations disagree');
  const permissions = [...badging.matchAll(/^uses-permission(?:-sdk-\d+)?: name='([^']+)'/gm)].map(match => match[1]).sort();
  return {
    packageName: pkg[1], versionName: pkg[3], versionCode: Number(pkg[2]), previousVersionCode: expected.previousVersionCode,
    certificateSha256: cert, nativeAbis, minimumSdk, targetSdk, permissions,
    embeddedBundleBytes: rows.find(row => row.name === 'assets/index.android.bundle').size,
    deploymentEligible: false,
    remainingAcceptance: ['Exact bundled source/runtime/API/configuration', 'Permission, backup and network policy review',
      'Complete-app device storage and authenticated role journeys', 'Physical-phone installation and data-preserving upgrade',
      'Paired API/client migration, backup and rollback acceptance', 'Verified HTTPS publication and update delivery'],
  };
}

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function inspectAndroidApk({ apkPath, buildToolsDirectory, javaExecutable, expected }) {
  validateExpected(expected);
  for (const file of [apkPath, buildToolsDirectory, javaExecutable]) {
    if (typeof file !== 'string' || !path.isAbsolute(file)) fail('Absolute local artifact and tool paths required');
  }
  const info = await lstat(apkPath);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > 512 * 1024 * 1024 || !apkPath.endsWith('.apk')) {
    fail('Invalid or oversized APK file');
  }
  const apk = await realpath(apkPath);
  const before = await hashFile(apk);
  const aapt = path.join(buildToolsDirectory, process.platform === 'win32' ? 'aapt.exe' : 'aapt');
  const signer = path.join(buildToolsDirectory, 'lib', 'apksigner.jar');
  // Avoid inherited credential/JVM injection settings. Verification needs no secrets.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME'].includes(key.toUpperCase())));
  async function run(file, args) {
    try {
      const result = await exec(file, args, { timeout: 30000, maxBuffer: 8 * 1024 * 1024,
        encoding: 'utf8', windowsHide: true, env });
      if (result.stderr.trim()) fail('Android inspection tool reported a diagnostic');
      return result.stdout;
    } catch { fail('Android inspection tool failed; no candidate accepted'); }
  }
  // Sequential checks bound CPU/memory on the local build machine.
  const signature = await run(javaExecutable, ['-jar', signer, 'verify', '--verbose', '--print-certs', '-Werr', apk]);
  const badging = await run(aapt, ['dump', 'badging', apk]);
  const manifest = await run(aapt, ['dump', 'xmltree', apk, 'AndroidManifest.xml']);
  const listing = await run(aapt, ['list', '-v', apk]);
  const afterInfo = await lstat(apkPath);
  if (afterInfo.isSymbolicLink() || afterInfo.size !== info.size || afterInfo.mtimeMs !== info.mtimeMs ||
      await realpath(apkPath) !== apk || await hashFile(apk) !== before) fail('APK changed during inspection');
  return { schemaVersion: 1, apkSha256: before, apkBytes: info.size,
    ...assessAndroidApk({ signature, badging, manifest, listing }, expected) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [apkPath, buildToolsDirectory, javaExecutable, expectationPath, ...extra] = process.argv.slice(2);
    if (!expectationPath || extra.length || !path.isAbsolute(expectationPath)) fail('Expected APK, build-tools, Java and expectation JSON absolute paths');
    const expectationFile = await lstat(expectationPath);
    if (!expectationFile.isFile() || expectationFile.size > 4096) fail('Invalid expectation file');
    const expected = JSON.parse(await readFile(expectationPath, 'utf8'));
    console.log(JSON.stringify(await inspectAndroidApk({ apkPath, buildToolsDirectory, javaExecutable, expected }), null, 2));
  } catch {
    console.error('Android APK preflight failed. No publication, installation or acceptance was performed.');
    process.exitCode = 1;
  }
}
