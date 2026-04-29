// Bug 1309 fix verified.
// Phase 14 Dispatch 01.
//
// Asserts that the production Prometheus + Alertmanager configs ship with
// real targets / receivers / rule_files, and that the alert rules reference
// only metric names actually emitted by metrics.service.ts. Catches the
// "empty scrape config" regression that Bug 1309 was filed against.

import fs from 'node:fs';
import path from 'node:path';
import { collectMetrics, toPrometheusFormat } from '../src/services/metrics.service';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const PROM_CFG = path.join(REPO_ROOT, 'infra/monitoring/prometheus.yml');
const RULES = path.join(REPO_ROOT, 'infra/monitoring/rules/onservice.yml');
const AM_CFG = path.join(REPO_ROOT, 'infra/monitoring/alertmanager.yml');

describe('Bug 1309 fix verified — prometheus + alertmanager configs', () => {
  it('production prometheus.yml exists, declares scrape_configs, and references rule_files', () => {
    const yaml = fs.readFileSync(PROM_CFG, 'utf8');
    expect(yaml).toMatch(/scrape_configs:/);
    expect(yaml).toMatch(/job_name:\s*api\b/);
    expect(yaml).toMatch(/job_name:\s*postgres\b/);
    expect(yaml).toMatch(/job_name:\s*redis\b/);
    expect(yaml).toMatch(/rule_files:/);
    expect(yaml).toMatch(/rules\/onservice\.yml/);
    expect(yaml).toMatch(/alertmanagers:/);
    // Empty scrape_configs would have at most a comment + nothing else;
    // assert there is at least one indented `- job_name:` line.
    const jobLines = yaml.split('\n').filter((l) => /^\s*-\s*job_name:/.test(l));
    expect(jobLines.length).toBeGreaterThanOrEqual(3);
  });

  it('alertmanager.yml routes page severity to pagerduty and warn to slack', () => {
    const yaml = fs.readFileSync(AM_CFG, 'utf8');
    expect(yaml).toMatch(/pagerduty-oncall/);
    expect(yaml).toMatch(/ops-slack/);
    expect(yaml).toMatch(/severity\s*=\s*page/);
    expect(yaml).toMatch(/inhibit_rules:/);
  });

  it('alert rules reference only metrics actually emitted by toPrometheusFormat', async () => {
    const yaml = fs.readFileSync(RULES, 'utf8');
    // Pull every onservice_* token used in an `expr:`.
    const exprLines = yaml.split('\n').filter((l) => /^\s*expr:/.test(l)).join('\n');
    const referenced = new Set(exprLines.match(/onservice_[a-z_]+/g) ?? []);

    // Render the actual metric output and pull the metric names from it.
    const snapshot = await collectMetrics();
    const rendered = toPrometheusFormat(snapshot);
    const emitted = new Set(rendered.match(/^onservice_[a-z_]+/gm) ?? []);

    const missing = [...referenced].filter((m) => !emitted.has(m));
    expect(missing).toEqual([]);
    // And, conversely, ensure we exercised at least one onservice_* metric so
    // the test would fail if the rule file accidentally lost all rules.
    expect(referenced.size).toBeGreaterThan(0);
  });

  it('alert rules cover the core failure modes (regression guard)', () => {
    const yaml = fs.readFileSync(RULES, 'utf8');
    const expectedAlerts = [
      'ApiDown',
      'ApiHighMemoryRSS',
      'DisputesQueueBackingUp',
      'NoCompletedBookingsToday',
      'NoActiveProviders',
      'PostgresDown',
      'RedisDown',
    ];
    for (const a of expectedAlerts) {
      expect(yaml).toContain(`alert: ${a}`);
    }
  });
});
