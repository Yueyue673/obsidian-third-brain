# Verification status

This file records evidence, not feature aspirations. Release acceptance must refer to the exact reviewed commit and downloaded assets.

## Latest completed full gates — 2026-10-05, repaired release candidate

- Typecheck, production build, filesystem smoke, publication pattern scan, release preparation and diff checks all exited 0 after the three release-blocker repairs and the additional prospective-work ownership regression.
- Full unit/integration suite: **446 passed across 15 files**, exit 0. Includes AI editorial/facet discovery through deterministic synthetic adapters, source decoding, freshness/privacy, per-paragraph/chunk request-boundary races, authenticated staging ownership, extraction wire-policy parity, settings snapshots, filesystem ownership/CAS/recovery, real loopback HTTP and synthetic process-crash cases. A count does not establish real-model semantic quality.
- Filesystem smoke: 8 originals, 14 fragments, 4 idea matches and 0 unrelated matches. Original SHA-256 hashes and modification times stayed unchanged; an unchanged rerun preserved IDs. No real AI provider was used.
- Publication scan: passed on the working tree. This is a conservative pattern scan, not comprehensive personal-information detection. Screenshots were manually inspected for publication scope too.
- Local release preparation: deterministic ZIP with only `main.js`, `manifest.json` and `styles.css`, plus individual assets and `SHA256SUMS`. Local archive-entry, CRC and hash validation passed; this is not GitHub delivery evidence.

The repaired code was committed as `a0169ed1c37e3580529c6ccbd0d29f4575dc6163`. GitHub CI run `37260195565` completed successfully on Ubuntu and Windows, each with Node 22 and 24. All four downloaded artifact sets passed SHA-256, archive-entry/CRC and byte-for-byte comparison against the local build. This establishes exact-commit CI delivery, not a public Release or its installation.

## Actual browser journey — earlier baseline

The production renderer/controller/core/filesystem from the earlier baseline was exercised using synthetic notes and local excerpts:

- Initial refresh displayed 8 source notes and 14 fragments.
- The vague dialogue-space idea returned four grounded candidates from dialogue and music notes, with distinct lexical/facet explanations.
- The two-character query `变量` returned two fragments through an existing mechanism label. Its explanation names the facet-keyword channel; it does not claim a verified causal relationship.
- Opening the original returned the exact current synthetic file; the quotation was checked against the same text.
- Facet click and keyboard search worked. An unrelated query produced zero cards. The 340px layout had no horizontal overflow.
- No page JavaScript errors or non-loopback browser requests occurred. All eight originals retained the same SHA-256 hashes and modification times.

Screenshots in `docs/images/test-harness-*.png` are real captures, explicitly labelled **not native Obsidian**. Their sample facets are declared in synthetic notes; they do not demonstrate automatic live-model discovery.

## Native Obsidian acceptance — earlier baseline, 2026-10-05

Real Obsidian **1.13.7** (the exact version the host reports), launched with an isolated profile against a fresh synthetic vault; the plugin folder was populated only from the release assets, which were byte-identical to the local build.

- First launch showed the host's own trust prompt; after approving it, the plugin registered and the activation panel mounted (`third-brain` 0.1.0).
- **Refresh notes** indexed the synthetic vault: `8 篇来源笔记 · 14 个片段`, status `可以使用 · 本地摘录 · 不调用 AI`.
- The vague idea returned four explained candidates from the dialogue and music notes; the visible explanations named the facet-keyword channel.
- **Open original** switched the real workspace to `创作/对话留下的空隙.md`, which is the exact expected synthetic source.
- The renderer made **zero network requests** and raised no JavaScript errors during the journey.
- All eight originals kept identical SHA-256 hashes; the owned derived layer (`Third Brain/Fragments`, including the hidden `.third-brain` state) was created inside the vault.
- The window was closed immediately after the run; no Obsidian process was left behind.

Screenshots `docs/images/native-obsidian-*.png` are captures of that run. This is real-host evidence for local excerpts; it is not live-AI evidence.

## Renewed native install attempt — 2026-10-05, repaired code

The exact Windows/Node 22 ZIP downloaded from CI `37260195565` was installed into the previously approved isolated synthetic vault. A parent readback verified that all three installed files are byte-identical to the ZIP and local build; all eight originals still have identical SHA-256 hashes and modification times.

The renewed **runtime journey remains unverified**. The desktop automation policy rejected remote-debugging launch parameters, so no alternate shell launch or unapproved debugging route was used. A subsequent native-UI-only launch also refused minimized startup because Windows could not provide the foreground lock needed to prevent activation. No test app instance was started. No permission was obtained for a foreground switch.

These attempts establish installation-byte correctness only, not the new runtime version, refresh/search/source-open journey, renderer errors/network activity, unchanged-rerun IDs or post-commit staging cleanup. The earlier host screenshots and the passing filesystem/process tests do not replace this pending renewed native gate. Publication remains on hold.

## Request-boundary privacy regressions

An independent read-only review found three send-boundary race gaps in the previous revision; each now has a regression test that was confirmed to fail on that revision and pass after the fix:

- A folder excluded after indexing no longer contributes labels to a cloud vocabulary request, even before the next refresh.
- Cloud donors are re-read and re-verified immediately before the request; a note changed or made private while later notes were still being checked is dropped.
- During incremental indexing, a pending note re-read at its request boundary that became private, changed or disappeared fails closed before any model request carries its text.

## Editorial extraction handoff regressions

The production transport, its prompt and the pure core now share the extraction limits: edited summaries at most 800 characters, exact excerpt summaries at most 6000 characters only when contained in a verified quotation, and at most six inferred labels per channel. Query interpretation remains separate: at most 24 labels selected from existing safe vocabulary, not newly invented labels.

Thirteen new real-loopback HTTP regressions cover those boundaries, including 3001/6000-character literal excerpts through transport and core, 800/801-character editorial summaries, all four facet channels, and the interpretation limit. Eleven failed on the old transport before the fix; all thirteen pass after it. The complete transport suite passes 92 tests. The server responses are explicitly deterministic synthetic fixtures: this validates the production network/schema handoff, not live-provider compatibility or semantic quality.

## Adversarial review and privacy-claim check

An earlier read-only review of DOM rendering, transport boundaries, store recovery and documentation found no reproducible P0/P1 defect within its inspected scope. It did find an overstatement: the privacy documentation incorrectly described replacing filenames with opaque source identifiers.

A real-loopback wire probe reproduced the actual behaviour: the user message has only `task`, `text` and `vocabulary`; source identifiers and paths are not attached as metadata, while some bare filenames in the note body remain unmasked. The privacy document and implementation brief now state that conservative boundary. An additional production core-to-HTTP test protects metadata omission and recognised-path redaction without freezing today's DLP blind spots as required behaviour.

An additional ad-hoc synthetic crash/recovery sweep was rerun on the store included in cc12fb6: 40 iterations, 25 forced commit-process exits, 15 clean commits, zero unexpected commit rejections and two forced recovery-process exits. Every iteration recovered a complete old or new revision with the matching fragment-file set, unchanged original text and a successful follow-up commit. The parent probe guards optional I/O event targets; an exception in a probe callback is not counted as an intended process crash. This is process-interruption evidence, not a real power-loss or hostile-filesystem guarantee.

## Subsequent release-blocker audit — repairs verified locally

The final audit found three reproducible P1 gaps, independently reproduced on cc12fb6: later extraction requests from the same note lacked a new privacy check; extraction dictionary labels could outlive a donor's privacy change; and no-journal staging cleanup inferred ownership from directory/file names. All three repairs now pass their regressions and the complete local gates; remote and downloaded-release acceptance remain separate.

The two request-boundary repairs now check every paragraph/chunk and the current proofs behind the actual outgoing dictionary. Required donors are checked before the active note; merged cached labels require all original donors. Common shared labels use an independent proof rather than an entire-library read on every request. An isolated copy of cc12fb6 with the new regression tests failed 22 selected tests; after the repairs, the complete core-boundary and real-HTTP suites passed 113 tests. Three real-loopback HTTP cases specifically demonstrate that an active-note, explicit-label or newly inferred-label privacy change blocks the second network request. No real AI provider was used.

Storage cleanup now requires a store/folder/transaction-bound authenticated inventory and an unchanged hash for each staged artifact. It retains unknown or edited files, invalid/forged/replayed inventories and unverifiable legacy orphans. Six selected regressions fail against an isolated cc12fb6 copy; the repaired store suite passes 74 tests. A follow-up found that prospective work filenames must not be claimed just because their bytes match a plan: that regression failed against the first repair and passes after work names were excluded from orphan cleanup. A real child-process exit after journal removal verifies forward state recovery and cleanup of authenticated unchanged staging. Tests use synthetic data only and hide child-process windows.

The marker is a local trust anchor, not a defence against an actor able to rewrite all metadata. Hash checks cannot eliminate concurrent check-to-unlink races. Exact-commit CI and artifact verification are complete for a0169ed. Renewed native/downloaded-install acceptance is still pending. The older process-interruption sweep alone does not establish the new cleanup repair's correctness.

## Boundaries still pending

- Live configured AI-provider compatibility and output quality: pending. No private notes or existing credentials were used. Deterministic adapters are not real-provider evidence.
- Public GitHub release, CI artifacts downloaded from that release, and installation from the downloaded files: pending. Local ZIP/hash checks and private-repository CI do not establish that final delivery path.

## Acceptance requirements

The numbered P01–P18 requirements and their evidence gates are defined in `PRODUCT-SPINE.md`. A test count is not a substitute for the main story: an idea without known tags retrieves grounded old material, explains the connection, and opens the exact original without changing originals.

Separate reports must cover unchanged-original hashes/mtime, unchanged-rerun IDs/model calls, long-note later-section retention, sparse/no-answer examples, cross-domain positive/negative examples, local/private request boundaries, cancellation/late results, protected-file conflicts, malformed state and interrupted-write recovery.

Before publishing, replace pending rows with real outputs or explicit limitations. Do not silently describe unrun optional-provider/native-host checks as complete.
