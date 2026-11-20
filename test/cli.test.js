import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = name => join(root, 'fixtures', `${name}.json`);
const run = (...args) => spawnSync(process.execPath, [join(root, 'bin/flaky-tests.js'), ...args], { encoding: 'utf8', timeout: 5000 });

function withTemp(action) {
  const folder = mkdtempSync(join(tmpdir(), 'flaky-tests-test-'));
  try { action(folder); } finally { rmSync(folder, { recursive: true, force: true }); }
}

function testsIn(report) { return report.suites[0].suites[0].specs[0].tests; }
function withModifiedReport(change, check) {
  withTemp(folder => {
    const file = join(folder, 'changed.json');
    const report = JSON.parse(readFileSync(fixture('flaky'), 'utf8'));
    change(report);
    writeFileSync(file, JSON.stringify(report));
    check(run(file));
  });
}

test('shows passes after retry and exits successfully', () => {
  const result = run(fixture('flaky'));
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /saves an order \[Chromium.*\] — 1 of 1 completed runs passed after retry/);
  assert.doesNotMatch(result.stdout, /Firefox/);
});

test('shows unresolved failures first, keeps projects separate, and counts across files', () => {
  const result = run(fixture('flaky'), fixture('still-failing'));
  assert.equal(result.status, 0);
  assert.ok(result.stdout.indexOf('Unresolved failures') < result.stdout.indexOf('Passed after retry'));
  assert.match(result.stdout, /saves an order \[Firefox.*\] — 1 of 2 completed runs ended in failure/);
  assert.match(result.stdout, /saves an order \[Chromium.*\] — 1 of 2 completed runs passed after retry/);
  assert.match(result.stdout, /shows a receipt.*1 of 1/);
});

test('does not fail just because all retries failed', () => {
  const result = run(fixture('still-failing'));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No passed retries were recorded/);
});

for (const [name, message] of [['no-retry-data', /retry history unavailable/], ['empty', /file is empty/], ['broken', /broken JSON/]]) {
  test(`explains ${name} and exits nonzero when used alone`, () => {
    const result = run(fixture(name));
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    assert.match(result.stderr, /No usable report/);
    assert.equal(result.stdout, '');
  });
}

test('identifies format by content, not the extension', () => withTemp(folder => {
  const valid = join(folder, 'results.txt');
  const unsupported = join(folder, 'playwright.json');
  copyFileSync(fixture('flaky'), valid);
  writeFileSync(unsupported, '{"testResults":[]}');
  assert.equal(run(valid).status, 0);
  const result = run(unsupported);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported format/);
}));

test('keeps usable files when another file is broken or lacks attempts', () => {
  const result = run(fixture('broken'), fixture('no-retry-data'), fixture('flaky'));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /1 of 1 completed runs passed after retry/);
  assert.match(result.stdout, /Read 1 of 3/);
  assert.match(result.stderr, /broken JSON/);
  assert.match(result.stderr, /retry history unavailable/);
});

test('counts a first-attempt pass with retry disabled; does not call it missing history', () => withModifiedReport(report => {
  testsIn(report).shift();
}, result => {
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /No passed retries were recorded/);
}));

test('does not count skipped, interrupted or intentionally failed tests', () => withModifiedReport(report => {
  const tests = testsIn(report);
  tests.push({ ...tests[0], status: 'skipped', results: [] });
  tests.push({ ...tests[0], status: 'unexpected', results: [{ retry: 0, status: 'interrupted' }] });
  tests.push({ ...tests[0], status: 'expected', expectedStatus: 'failed', results: [{ retry: 0, status: 'failed' }] });
}, result => {
  assert.equal(result.status, 0);
  assert.match(result.stdout, /1 of 1 completed runs passed after retry/);
  assert.match(result.stdout, /None in the usable results/);
}));

test('warns on incomplete attempt history without including it in the denominator', () => withModifiedReport(report => {
  const tests = testsIn(report);
  tests.push({ ...tests[0], results: [{ retry: 1, status: 'passed' }] });
}, result => {
  assert.equal(result.status, 0);
  assert.match(result.stderr, /retry history unavailable/);
  assert.match(result.stdout, /1 of 1 completed runs passed after retry/);
}));

test('prints friendly help and handles missing arguments and files', () => {
  assert.equal(run('--help').status, 0);
  assert.match(run('--help').stdout, /Usage: flaky-tests/);
  assert.equal(run().status, 1);
  assert.match(run().stderr, /No report files/);
  const missing = run(fixture('does-not-exist'));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /file was not found/);
});
