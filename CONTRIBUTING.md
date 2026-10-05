# Contributing

Read `PRODUCT-SPINE.md` and `AGENTS.md` before changes. Each contribution should fix a reproduced defect or a numbered product requirement in the same activation journey. Prefer one evidenced improvement to a larger feature list.

## Set up

Use Node 22.12+ and `npm ci --ignore-scripts`. Run `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`, `npm run privacy:check` and `npm run release`. Use only synthetic fixtures or a disposable copy you are authorised to process.

## Boundaries

- Never change a user's original notes or infer output ownership from a folder name.
- No click/dwell learning, telemetry, OS sensing, per-keystroke model calls or automatic source insertion.
- Model responses are untrusted data. Reject unknown schema fields and unsupported quotations; models cannot pick paths or execute tools.
- Cloud processing remains explicit opt-in, with local/private filtering before conversion and calls.
- Do not copy competitor implementations or submit private note/transcript/configuration content.
- Tests, real provider checks, browser harnesses and native-host checks must be labelled separately. Do not invent results or call a screenshot harness an Obsidian screenshot.

## Pull request

Explain the user's problem, the smallest causal change, the product requirement/bug it addresses, test output and a safe reproduction. UI changes need actual screenshots at wide/narrow widths and keyboard/error coverage. Storage changes need ownership, failure/recovery and unchanged-original evidence.

Publication gates include a privacy review, deterministic release archive, exact-commit CI and downloaded-asset verification. Preserve the existing usable version; do not bypass a failing gate to produce a release.
