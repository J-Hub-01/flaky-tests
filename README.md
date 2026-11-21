# flaky-tests

Read saved Playwright reports and see which tests passed only after a retry.

## Try it in 30 seconds

From this project folder, with **Node.js 22 or newer** installed, run:

```sh
node bin/flaky-tests.js fixtures/flaky.json fixtures/still-failing.json
```

You’ll see output like this:

```text
Unresolved failures
  tests/checkout.spec.ts › checkout › saves an order [Firefox (firefox)] — 1 of 2 completed runs ended in failure or another unexpected result.
  tests/checkout.spec.ts › checkout › shows a receipt [Chromium (chromium)] — 1 of 1 completed runs ended in failure or another unexpected result.

Passed after retry
  tests/checkout.spec.ts › checkout › saves an order [Chromium (chromium)] — 1 of 2 completed runs passed after retry.

Read 2 of 2 report file(s) with usable results.
```

Imagine testing whether a light turns on. The first flip does nothing. The second works. Trying again is a **retry**. A test that fails and then passes on retry is called **flaky** here. The final pass does not explain why the first attempt failed.

## Use your own reports

If you have a saved Playwright JSON report, skip to the second command. Otherwise, run Playwright from your test project to create one:

```sh
npx playwright test --retries=1 --reporter=json > results.json
flaky-tests results.json
```

To make `flaky-tests` available before publication, run `npm install -g .` from this repository, or use `node bin/flaky-tests.js` from this folder. **After publication**, you can use `npx flaky-test results.json` without a global install. The first `npx` run may fetch the command; the installed command itself does not use the network.

You can pass more than one file:

```sh
flaky-tests run1.json run2.json run3.json
```

If Playwright ends with a failure, you can still run `flaky-tests` on the saved file. In a continuous integration (CI) job, which runs checks for you, keep Playwright’s own exit status. This tool reports what happened; it does not decide whether your test job should pass.

## How to read the results

- **Unresolved failures** come first. These are completed executions that still had an unexpected result, even after any recorded retries.
- **Passed after retry** shows a count such as **3 of 12 completed runs**. Each execution counts once, whether it took one attempt or several. A failure that never passes is counted in the denominator, not as a passed retry.
- Projects and browsers stay separate. A Chromium result is not counted as a Firefox result.
- Skipped, interrupted, and expected failures do not count. A test that was marked as expected to fail but unexpectedly passed can be listed as unresolved.
- **Retry history unavailable** means the report did not give enough usable details. Those results are not counted. A normal Playwright result with a recorded first attempt and no retry counts as a first-attempt result.
- If one file is bad but another is usable, you still get a report and a successful exit. The command exits with an error only when it cannot produce a usable report. Unresolved tests and flakes do not change that rule.

Use each saved report once. Repeating the same input counts it again. For parallel jobs, supply a complete merged Playwright JSON report, or make sure the files you supply do not overlap.

## What it does and does not do

It reads the contents of saved Playwright JSON files, even if their names do not end in `.json`. It does not run tests, change a test result, contact a service, or save history. It does not read Jest, Vitest, JUnit, or CTRF reports. There is no configuration file.

## How it differs from other tools

| Tool | Difference |
| --- | --- |
| [Playwright’s reporting](https://playwright.dev/docs/test-retries) | Playwright already marks tests as flaky in a run. `flaky-tests` reads those saved run files and adds counts across the ones you choose. |
| [CTRF GitHub Test Reporter](https://github.com/ctrf-io/github-test-reporter) | It analyzes Common Test Report Format results and can show past results in GitHub. This tool reads Playwright’s own JSON and prints a local summary. |
| [Trunk](https://trunk.io/flaky-tests) | Trunk offers a service for tracking and managing flaky tests. This tool works with files already on your machine. |
| [Currents](https://docs.currents.dev/) | Currents provides connected test reports and history. This tool has no account or dashboard, and only sees the files you pass it. |

## Coming later

These are ideas, not promises: more examples from real Playwright runs, a recipe for reading merged parallel reports, and an optional machine-readable summary. No other test runners or hosted service are planned for version 1.

## Work on the project locally

```sh
npm run build
npm test
```

The build step checks the JavaScript for syntax errors. There is nothing to compile and no runtime dependency to install.

[MIT license](LICENSE) · [Handoff and publishing checklist](HANDOFF.md)
