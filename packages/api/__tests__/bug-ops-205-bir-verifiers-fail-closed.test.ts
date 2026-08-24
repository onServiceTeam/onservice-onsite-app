import { execFileSync } from 'node:child_process';
import path from 'node:path';

function bashExecutable(): string {
  return process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
}

function runVerifier(name: string): { status: number; output: string } {
  try {
    execFileSync(bashExecutable(), [path.resolve(__dirname, `../../../scripts/${name}`)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output: '' };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? -1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

it('Bug OPS-205 — BIR launch verifiers fail closed instead of certifying dead variables, routes, or tables', () => {
  const series = runVerifier('verify-bir-or-series.sh');
  const pipeline = runVerifier('verify-bir-pipeline.sh');

  expect(series.status).not.toBe(0);
  expect(series.output).toContain('BIR invoice authority/series is not wired');
  expect(series.output).toContain('E22-bir-invoice-numbering-and-fake-verifiers');

  expect(pipeline.status).not.toBe(0);
  expect(pipeline.output).toContain('cannot be certified while E22 is open');
  expect(pipeline.output).toContain('official_receipts');
});
