# Handoff: flaky-tests 1.0.0

## 1. Done

| File | What it does |
| --- | --- |
| `package.json` | Defines the npm package, executable, Node requirement, published files, build check, and test command. |
| `bin/flaky-tests.js` | Dependency-free Node CLI. Reads local reports, checks attempt history, keeps projects separate, and prints failures and passed retries. |
| `fixtures/flaky.json` | A Chromium pass after retry and a first-attempt Firefox pass. |
| `fixtures/still-failing.json` | Two unresolved failures and a first-attempt Chromium pass. |
| `fixtures/no-retry-data.json` | Playwright-style file with attempts missing retry indexes. |
| `fixtures/empty.json` | Zero-byte file for the empty-file check. |
| `fixtures/broken.json` | Deliberately incomplete JSON. |
| `test/cli.test.js` | Twelve tests using Node’s built-in test runner; invokes the actual CLI. |
| `README.md` | Beginner example, usage, scope, and comparison with related tools. |
| `LICENSE` | MIT license. |
| `.gitignore` | Excludes local dependencies, test output, and tarballs. |
| `HANDOFF.md` | This verification record, checklist, and publishing guide. |

## 2. Verified

Ran locally on Linux with Node **22.23.4** and npm **10.9.9**:

- `npm run build`: succeeded (`node --check`).
- `npm test` (`node --test`): **12 passed, 0 failed**.
- `node bin/flaky-tests.js fixtures/flaky.json fixtures/still-failing.json`: succeeded; output matched the README example, with failures first and the two browser counts separate.
- `npm pack --dry-run`: succeeded; listed 9 publishable files including the binary, README, license, manifest, and examples. Tests and this handoff are in the submission repo, not in the npm tarball.
- `npm pack`, then `npm install <local tarball> --offline --ignore-scripts --no-audit --no-fund` in a fresh project: succeeded. The installed executable reported `1 of 1` on the flaky fixture.
- Generated a real Playwright **1.65.1** JSON report from a controlled test that failed first and passed on retry. The CLI reported `1 of 1 completed runs passed after retry`. This check did not require a browser and is not an npm test dependency.
- A direct request to `https://registry.npmjs.org/flaky-tests` returned **HTTP 404** on November 20, 2026. This does not reserve the name or guarantee npm will accept it.

**Not run or verified:** `npm login`, `npm publish`, the public `npx flaky-tests` command, global installation, Windows/macOS, other Node or Playwright versions, and very large reports. No registry write was attempted. The no-network claim for the command is based on its local-only code; there was no packet capture or network-blocked runtime test.

## 3. To do, in order

- [ ] Unzip the project and run the local checks below. Submit the repository; publishing is not needed to demonstrate it.
- [ ] If publishing is part of the submission, recheck the npm name and confirm it is accepted. If needed, use a scoped name such as `@your-scope/flaky-tests`; keep the executable name `flaky-tests` and update the README’s package invocation.
- [ ] Review the tarball, publish, and verify the published executable in a fresh directory.
- [ ] After the deadline, test more Node versions and operating systems before claiming coverage. Keep other report formats and services out of v1.

## 4. Known issues and risks

- The tool reads entire JSON files into memory. It does not stream huge reports.
- Supplying the same report twice, or supplying overlapping files from parallel jobs, counts executions twice. Use each report once.
- Grouping uses file path, full test title, and project identity. Renames split groups; identical test identities can merge. Line numbers are not used, so moving a test within its file does not split its history.
- Reports with run-level errors are skipped rather than treated as complete. Tests with incomplete attempts do not count. A retry-disabled run can still provide a first attempt, but cannot tell you what would have happened on a retry.
- npm may reject an apparently unclaimed name. There is no public release yet. The first `npx` invocation can use the network to install the command; the command itself does not make network calls.

## 5. Exact steps to finish

From the extracted `flaky-tests` folder, with Node 22 or newer:

```sh
node --version
npm install --offline --no-audit --no-fund
npm run build
npm test
node bin/flaky-tests.js fixtures/flaky.json fixtures/still-failing.json
```

There are no dependencies; `npm install` is optional for running the local checks. To verify the npm package name and inspect what would ship:

```sh
npm view flaky-tests name version --registry=https://registry.npmjs.org/
npm pack --dry-run
```

If npm returns a version, the name is taken. If it returns not found, the name may be available; a temporary registry error does not establish that. When you are authorized and ready to publish:

```sh
npm login
npm pack --dry-run
npm publish --access public
```

Then verify the exact version from a fresh folder, replacing the report path with a real file:

```sh
npx --yes flaky-tests@1.0.0 /absolute/path/to/results.json
```

## 6. The next prompt

> Continue from this `flaky-tests` repository and read `HANDOFF.md` first. The Node CLI is implemented, and 12 tests passed on Linux under Node 22.23.4. My submission deadline is near. Rerun `npm run build`, `npm test`, the two-fixture example, and `npm pack --dry-run`. Fix only reproducible blockers without expanding v1. Update `HANDOFF.md` with exactly what you ran. Do not publish without my explicit instruction. Return the updated submission ZIP.
