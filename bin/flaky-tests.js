#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const usage = 'Usage: flaky-tests <report.json> [more-reports.json ...]';
const failedStatuses = new Set(['failed', 'timedOut']);
const attemptStatuses = new Set(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
const retryHelp = 'Save a fresh Playwright JSON report with --reporter=json. Enable retries in Playwright to observe retry outcomes.';

/** Keep terminal control characters and line breaks out of filenames and test names. */
function plainText(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, ' ');
}

/** Playwright suites may contain both specs and nested suites. */
function* readTests(report) {
  const stack = report.suites.slice().reverse().map(suite => ({ suite, parents: [] }));
  while (stack.length) {
    const { suite, parents } = stack.pop();
    if (!suite || typeof suite !== 'object') continue;
    const titles = typeof suite.title === 'string' && suite.title ? [...parents, suite.title] : parents;
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      if (typeof spec?.title !== 'string' || !Array.isArray(spec.tests)) continue;
      const file = typeof spec.file === 'string' && spec.file ? spec.file :
        typeof suite.file === 'string' && suite.file ? suite.file : '';
      const groups = file && titles[0] === file ? titles.slice(1) : titles;
      const testName = [...groups, spec.title].join(' › ');
      for (const test of spec.tests) {
        if (!test || typeof test !== 'object') continue;
        const projectId = typeof test.projectId === 'string' ? test.projectId : '';
        const projectName = typeof test.projectName === 'string' ? test.projectName : '';
        yield { test, testName, file, projectId, projectName };
      }
    }
    if (Array.isArray(suite.suites)) {
      for (let i = suite.suites.length - 1; i >= 0; i--) stack.push({ suite: suite.suites[i], parents: titles });
    }
  }
}

/** Use attempts, not the overall pass/fail label. Unknown evidence must not count as a pass. */
function classify(test) {
  if (test.status === 'skipped' || test.expectedStatus === 'skipped') return 'excluded';
  if (test.expectedStatus === 'failed' && test.status === 'expected') return 'excluded';
  if (!Array.isArray(test.results) || !test.results.length || !test.results.every(attempt =>
    Number.isSafeInteger(attempt?.retry) && attempt.retry >= 0 && attemptStatuses.has(attempt.status))) return 'unknown';
  const attempts = [...test.results].sort((a, b) => a.retry - b.retry);
  if (!attempts.every((attempt, index) => attempt.retry === index)) return 'unknown';
  const finalAttempt = attempts.at(-1);
  if (finalAttempt.status === 'skipped' || finalAttempt.status === 'interrupted') return 'excluded';
  if (attempts.slice(0, -1).some(attempt => !failedStatuses.has(attempt.status))) return 'unknown';
  if (test.expectedStatus === 'failed') {
    // Do not call a test marked to fail a flake. An unexpected pass is still unresolved.
    return test.status === 'unexpected' ? 'unresolved' : 'excluded';
  }
  if (failedStatuses.has(finalAttempt.status)) return 'unresolved';
  return attempts.length > 1 ? 'retriedPass' : 'firstPass';
}

/** Load and validate one saved report. A bad file does not hide the other files. */
async function loadReport(file) {
  const label = plainText(file);
  let text;
  try {
    text = (await readFile(file, 'utf8')).trim();
  } catch (error) {
    return { warning: `Could not read ${label}. ${error?.code === 'ENOENT' ? 'The file was not found.' : 'The file could not be opened.'} Check the path and make sure the file is readable.` };
  }
  if (!text) return { warning: `Could not read ${label}: the file is empty. Save a new report with Playwright's JSON reporter.` };
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    return { warning: `Could not read ${label}: it contains broken JSON. Save a fresh report with Playwright's JSON reporter instead of editing the file by hand.` };
  }
  if (!Array.isArray(report?.suites) || !report.stats || typeof report.stats !== 'object' ||
      !['expected', 'unexpected', 'flaky', 'skipped'].every(key => Number.isInteger(report.stats[key]))) {
    return { warning: `Could not read ${label}: unsupported format. Use a saved Playwright JSON report (--reporter=json).` };
  }
  if (Array.isArray(report.errors) && report.errors.length) {
    return { warning: `Could not use ${label}: Playwright recorded an error for the run as a whole. Read the original Playwright output, fix the run-level error, and save a new report.` };
  }
  return { report };
}

/** @param {string[]} reportFiles */
async function main(reportFiles) {
  if (reportFiles.length === 1 && ['--help', '-h'].includes(reportFiles[0])) {
    console.log(`${usage}\nRead saved Playwright JSON results and show which tests passed after a retry.`);
    return;
  }
  if (!reportFiles.length) {
    console.error(`No report files were given. Supply at least one saved Playwright JSON report.\n${usage}`);
    process.exitCode = 1;
    return;
  }
  const summaries = new Map();
  let usableReportCount = 0;
  let warningCount = 0;
  for (const reportFile of reportFiles) {
    const { report, warning } = await loadReport(reportFile);
    if (warning) {
      console.error(warning);
      warningCount++;
      continue;
    }
    let completedInFile = 0;
    let unknownInFile = 0;
    for (const entry of readTests(report)) {
      const { test, testName, file, projectId, projectName } = entry;
      const outcome = classify(test);
      if (outcome === 'unknown') { unknownInFile++; continue; }
      if (outcome === 'excluded') continue;
      completedInFile++;
      const key = JSON.stringify([file, testName, projectId, projectName]);
      if (!summaries.has(key)) {
        const projectLabel = projectName && projectId && projectName !== projectId
          ? `${projectName} (${projectId})` : projectName || projectId || 'default project';
        const label = plainText(`${file ? `${file} › ` : ''}${testName} [${projectLabel}]`);
        summaries.set(key, { label, completedRunCount: 0, retriedPassCount: 0, unresolvedCount: 0 });
      }
      const summary = summaries.get(key);
      summary.completedRunCount++;
      if (outcome === 'retriedPass') summary.retriedPassCount++;
      if (outcome === 'unresolved') summary.unresolvedCount++;
    }
    if (completedInFile) usableReportCount++;
    if (!completedInFile || unknownInFile) {
      const detail = completedInFile ? `retry history unavailable for ${unknownInFile} test result(s); they were not counted.` :
        'retry history unavailable for a completed test. The report may contain only skipped or interrupted tests, or it may not include attempts.';
      console.error(`${plainText(reportFile)}: ${detail} ${retryHelp}`);
      warningCount++;
    }
  }
  if (!usableReportCount) {
    console.error('No usable report could be produced. Fix the report files above and try again.');
    process.exitCode = 1;
    return;
  }
  const all = [...summaries.values()];
  const failures = all.filter(item => item.unresolvedCount).sort((a, b) => b.unresolvedCount - a.unresolvedCount || a.label.localeCompare(b.label));
  const flakes = all.filter(item => item.retriedPassCount).sort((a, b) => b.retriedPassCount - a.retriedPassCount || a.label.localeCompare(b.label));
  console.log('Unresolved failures');
  if (!failures.length) console.log('  None in the usable results.');
  for (const item of failures) console.log(`  ${item.label} — ${item.unresolvedCount} of ${item.completedRunCount} completed runs ended in failure or another unexpected result.`);
  console.log('\nPassed after retry');
  if (!flakes.length) console.log('  No passed retries were recorded in the usable results.');
  for (const item of flakes) console.log(`  ${item.label} — ${item.retriedPassCount} of ${item.completedRunCount} completed runs passed after retry.`);
  console.log(`\nRead ${usableReportCount} of ${reportFiles.length} report file(s) with usable results.${warningCount ? ' Some files or test results were not counted; see the messages above.' : ''}`);
}

await main(process.argv.slice(2));
