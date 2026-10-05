# Changelog

## Unreleased — 0.1.0 in preparation

Initial source-grounded activation slice: one sidebar, separate owned derived layer, local-excerpt baseline and optional explicitly configured model modes. The implementation includes source revision/evidence checks, bounded privacy policy and transaction recovery; release acceptance is tracked in `docs/VERIFICATION.md`.

- Local retrieval now finds keywords within existing facet labels, respects breadth/topic boundaries, and explains these as metadata matches rather than verified causal relations.
- Source adapters strictly decode UTF-8 and BOM-marked UTF-16 while retaining byte-based source hashes; legitimate replacement glyphs are preserved.
- Stale or newly private evidence invalidates the entire merged suggestion until refresh, preventing another source from inheriting unsupported labels.
- Chinese presentation translates only program-owned explanations; author/model text and original quotes remain literal.
- Settings snapshots and cancellation prevent a mid-run consent/configuration change from silently changing the model boundary.
- Send-boundary privacy: cloud donors and pending indexing sources are re-verified immediately before each model request; newly excluded folders stop contributing cloud/local vocabulary at once; a source that became private, changed or vanished inside the request window fails closed instead of being sent.
- A completed commit removes its own transaction staging directory (dead state copies, staged and work files); recovery prunes leftovers from an interrupted finalization, while unrecognised files inside those directories are never deleted.
- Native acceptance on Obsidian 1.13.7: install → refresh → idea → open original exercised against an isolated synthetic vault, with zero renderer network requests and unchanged originals.
- Extraction prompt, transport and core share one policy: edited summaries up to 800 characters, exact quoted excerpts up to 6000, and at most six inferred labels per channel. Real HTTP regressions retain the separate existing-vocabulary interpretation boundary.
- Privacy documentation now distinguishes omitted source metadata from conservative redaction within note text. Some bare filenames and unrecognised confidential details may remain in an explicitly authorised model request; no blanket filename anonymisation is promised.

This draft does not establish a public release. The completed native-host journey and its limits are recorded in `docs/VERIFICATION.md`; GitHub publication, exact-commit CI and downloaded-release installation must be verified before this entry is promoted to a dated release.
