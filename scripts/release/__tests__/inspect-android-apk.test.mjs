import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { assessAndroidApk, inspectAndroidApk } from '../inspect-android-apk.mjs';

const pin = 'a'.repeat(64);
const expected = () => ({ packageName: 'ph.onservice.app', versionName: '1.0.1', versionCode: 2,
  previousVersionCode: 1, certificateSha256: pin, requiredAbis: ['arm64-v8a'] });
const row = (name, size = 500) => `     ${size}  Deflate     100  80%       643  01-01-81 01:01  559ad249  ${name}`;
const observations = () => ({
  badging: "package: name='ph.onservice.app' versionCode='2' versionName='1.0.1' platformBuildVersionName='16'\nsdkVersion:'24'\ntargetSdkVersion:'36'\nlaunchable-activity: name='ph.onservice.app.MainActivity' label=''\nnative-code: 'arm64-v8a'\nuses-permission: name='android.permission.INTERNET'\n",
  manifest: 'N: android=http://schemas.android.com/apk/res/android\n  E: manifest (line=2)\n    E: application (line=11)\n      A: android:debuggable(0x0101000f)=(type 0x12)0x0\n',
  listing: ['Archive:  synthetic.apk', ' Length   Method    Size  Ratio   Offset      Date  Time  CRC-32    Name',
    row('AndroidManifest.xml'), row('classes.dex'), row('assets/index.android.bundle', 8192), row('lib/arm64-v8a/libhermes.so'),
    '    9692             400  95%                            4 files', ''].join('\n'),
  signature: `Verifies\nVerified using v1 scheme (JAR signing): false\nVerified using v2 scheme (APK Signature Scheme v2): true\nNumber of signers: 1\nSigner #1 certificate DN: CN=Synthetic fixture\nSigner #1 certificate SHA-256 digest: ${pin}\n`,
});

test('positive SDK observations report exact identity without claiming deployment eligibility', () => {
  assert.deepEqual(assessAndroidApk(observations(), expected()), {
    packageName: 'ph.onservice.app', versionName: '1.0.1', versionCode: 2, previousVersionCode: 1,
    certificateSha256: pin, nativeAbis: ['arm64-v8a'], minimumSdk: 24, targetSdk: 36,
    permissions: ['android.permission.INTERNET'], embeddedBundleBytes: 8192, deploymentEligible: false,
    remainingAcceptance: ['Exact bundled source/runtime/API/configuration', 'Permission, backup and network policy review',
      'Complete-app device storage and authenticated role journeys', 'Physical-phone installation and data-preserving upgrade',
      'Paired API/client migration, backup and rollback acceptance', 'Verified HTTPS publication and update delivery'],
  });
});

test('same-version, downgrade, fractional and invalid expectation contracts fail before tool execution', async () => {
  for (const mutation of [{ previousVersionCode: 2 }, { previousVersionCode: 3 }, { versionCode: 1.5 },
    { versionCode: 2100000001 }, { previousVersionCode: -1 }, { requiredAbis: ['x86_64'] },
    { requiredAbis: ['arm64-v8a', 'arm64-v8a'] }, { certificateSha256: 'wrong' },
    { packageName: ['ph.onservice.app'] }, { ignoreSignature: true }, { versionName: '' }]) {
    await assert.rejects(inspectAndroidApk({ expected: { ...expected(), ...mutation } }), /Invalid Android release expectation/);
  }
});

test('package, version name and numeric version code must match the independently supplied expectation', () => {
  for (const mutation of [{ packageName: 'ph.other.app' }, { versionName: '1.0.2' }, { versionCode: 3 }]) {
    assert.throws(() => assessAndroidApk(observations(), { ...expected(), ...mutation }), /identity mismatch/);
  }
});

test('debug, test-only and unresolved development flags cannot pass as a release', () => {
  for (const flag of ['debuggable', 'testOnly']) {
    for (const value of ['(type 0x12)0xffffffff', '(type 0x12)0x1', '@0x7f010001', '"true"']) {
      const actual = observations();
      actual.manifest += `      A: android:${flag}(0x0101000f)=${value}\n`;
      assert.throws(() => assessAndroidApk(actual, expected()), /Debuggable or test-only/);
    }
  }
  const actual = observations(); actual.badging += 'application-debuggable\n';
  assert.throws(() => assessAndroidApk(actual, expected()), /Debuggable or test-only/);
});

test('development sentinels reject without exposing the manifest value in the error', () => {
  const actual = observations(); actual.manifest += '      A: android:value="DEV_MISSING_PRIVATE_VALUE"\n';
  assert.throws(() => assessAndroidApk(actual, expected()), error =>
    error.message === 'APK manifest contains development configuration' && !error.message.includes('PRIVATE_VALUE'));
});

test('absent, mismatched, debug and multiple signer identities fail closed', () => {
  for (const signature of [observations().signature.replace(pin, 'b'.repeat(64)),
    observations().signature.replace('Verifies', 'DOES NOT VERIFY'),
    observations().signature.replace('CN=Synthetic fixture', 'CN=Android Debug, O=Android, C=US'),
    observations().signature.replace('Number of signers: 1', 'Number of signers: 2'),
    observations().signature + `Signer #2 certificate SHA-256 digest: ${pin}\n`,
    observations().signature.replace(': true', ': false'),
    observations().signature.replace(pin, 'not-a-pin')]) {
    assert.throws(() => assessAndroidApk({ ...observations(), signature }, expected()), /certificate|signature|signing identities/);
  }
});

test('missing or empty embedded bundle, DEX and manifest are rejected', () => {
  for (const name of ['assets/index.android.bundle', 'classes.dex', 'AndroidManifest.xml']) {
    for (const empty of [false, true]) {
      const actual = observations();
      actual.listing = actual.listing.replace(row(name, name.endsWith('.bundle') ? 8192 : 500),
        empty ? row(name, 0) : row(`${name}.absent`));
      assert.throws(() => assessAndroidApk(actual, expected()), /embedded application content/);
    }
  }
});

test('archive inventory rejects duplicates, unparsed entries, traversal and absolute names', () => {
  for (const extra of [row('classes.dex'), row('../outside'), row('/absolute'), row('lib\\arm64-v8a\\bad.so'), 'unparsed archive row']) {
    const actual = observations(); actual.listing = actual.listing.replace('4 files', '5 files') + extra + '\n';
    assert.throws(() => assessAndroidApk(actual, expected()), /archive inventory/);
  }
});

test('required phone architecture must exist in both actual archive and SDK observations', () => {
  for (const [listing, badging] of [
    [observations().listing.replace('lib/arm64-v8a/', 'lib/x86_64/'), observations().badging],
    [observations().listing, observations().badging.replace("native-code: 'arm64-v8a'", "native-code: 'x86_64'")],
  ]) assert.throws(() => assessAndroidApk({ ...observations(), listing, badging }, expected()), /architecture/);
});

test('incomplete and ambiguous SDK output is not treated as evidence', () => {
  for (const field of ['badging', 'manifest', 'listing', 'signature']) {
    assert.throws(() => assessAndroidApk({ ...observations(), [field]: '' }, expected()), /Incomplete/);
  }
  const actual = observations(); actual.badging += actual.badging.split('\n')[0] + '\n';
  assert.throws(() => assessAndroidApk(actual, expected()), /ambiguous APK identity/);
  assert.throws(() => assessAndroidApk({ ...observations(), badging: observations().badging.replace(/launchable-activity:[^\n]+\n/, '') }, expected()), /launchable activity/);
});

test('real process failure and CLI rejection never echo untrusted file contents or tool diagnostics', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'onservice-apk-inspection-'));
  try {
    const apkPath = path.join(directory, 'fixture.apk');
    await writeFile(apkPath, 'private-tool-output-marker');
    await assert.rejects(inspectAndroidApk({ apkPath, buildToolsDirectory: directory,
      javaExecutable: process.execPath, expected: expected() }), error =>
      error.message === 'Android inspection tool failed; no candidate accepted');
    const expectations = path.join(directory, 'expectation.json');
    await writeFile(expectations, JSON.stringify(expected()));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../inspect-android-apk.mjs', import.meta.url)),
      apkPath, directory, process.execPath, expectations], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'Android APK preflight failed. No publication, installation or acceptance was performed.');
  } finally {
    assert.equal(path.dirname(await realpath(directory)), await realpath(tmpdir()));
    assert.match(path.basename(directory), /^onservice-apk-inspection-/);
    await rm(directory, { recursive: true, force: true });
  }
});
