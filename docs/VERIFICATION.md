# Verification status

This file records evidence, not feature aspirations. Release acceptance must refer to the exact reviewed commit and downloaded assets.

## Current build evidence — 2026-10-05

- Typecheck, production build, filesystem smoke, publication pattern scan and release preparation all exited 0 on the current working tree.
- Full unit/integration suite: **384 passed across 14 files**, exit 0. Includes AI editorial/facet discovery through deterministic synthetic adapters, source decoding, freshness/privacy, request-boundary race regressions, settings snapshots, filesystem ownership/CAS/recovery, real loopback HTTP and synthetic process-crash cases. A count does not establish real-model semantic quality.
- Filesystem smoke: 8 originals, 14 fragments, 4 idea matches and 0 unrelated matches. Original SHA-256 hashes and modification times stayed unchanged; an unchanged rerun preserved IDs. No real AI provider was used.
- Publication scan: passed on the working tree. This is a conservative pattern scan, not comprehensive personal-information detection. Screenshots were manually inspected for publication scope too.
- Local release preparation: deterministic ZIP with only `main.js`, `manifest.json` and `styles.css`, plus individual assets and `SHA256SUMS`. Local archive-entry, CRC and hash validation passed; this is not GitHub delivery evidence.

## Actual browser journey

The current production renderer/controller/core/filesystem was exercised using synthetic notes and local excerpts:

- Initial refresh displayed 8 source notes and 14 fragments.
- The vague dialogue-space idea returned four grounded candidates from dialogue and music notes, with distinct lexical/facet explanations.
- The two-character query `变量` returned two fragments through an existing mechanism label. Its explanation names the facet-keyword channel; it does not claim a verified causal relationship.
- Opening the original returned the exact current synthetic file; the quotation was checked against the same text.
- Facet click and keyboard search worked. An unrelated query produced zero cards. The 340px layout had no horizontal overflow.
- No page JavaScript errors or non-loopback browser requests occurred. All eight originals retained the same SHA-256 hashes and modification times.

Screenshots in `docs/images/test-harness-*.png` are real captures, explicitly labelled **not native Obsidian**. Their sample facets are declared in synthetic notes; they do not demonstrate automatic live-model discovery.

## Request-boundary privacy regressions

An independent read-only review found three send-boundary race gaps in the previous revision; each now has a regression test that was confirmed to fail on that revision and pass after the fix:

- A folder excluded after indexing no longer contributes labels to a cloud vocabulary request, even before the next refresh.
- Cloud donors are re-read and re-verified immediately before the request; a note changed or made private while later notes were still being checked is dropped.
- During incremental indexing, a pending note re-read at its request boundary that became private, changed or disappeared fails closed before any model request carries its text.

## Boundaries still pending

- Native Obsidian disposable-vault enable → refresh → idea → open original: pending. Visible-window permission has not been assumed; an isolated directory or launch attempt is not native acceptance.
- Live configured AI-provider compatibility and output quality: pending. No private notes or existing credentials were used. Deterministic adapters are not real-provider evidence.
- Exact-commit GitHub CI, public release publication and downloaded-asset/native-install checks: pending. Local ZIP/hash checks do not establish delivery.

## Acceptance requirements

The numbered P01–P18 requirements and their evidence gates are defined in `PRODUCT-SPINE.md`. A test count is not a substitute for the main story: an idea without known tags retrieves grounded old material, explains the connection, and opens the exact original without changing originals.

Separate reports must cover unchanged-original hashes/mtime, unchanged-rerun IDs/model calls, long-note later-section retention, sparse/no-answer examples, cross-domain positive/negative examples, local/private request boundaries, cancellation/late results, protected-file conflicts, malformed state and interrupted-write recovery.

Before publishing, replace pending rows with real outputs or explicit limitations. Do not silently describe unrun optional-provider/native-host checks as complete.
