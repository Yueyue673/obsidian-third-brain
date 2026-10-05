# Changelog

## Unreleased — 0.1.0 in preparation

Initial source-grounded activation slice: one sidebar, separate owned derived layer, local-excerpt baseline and optional explicitly configured model modes. The implementation includes source revision/evidence checks, bounded privacy policy and transaction recovery; release acceptance is tracked in `docs/VERIFICATION.md`.

- Local retrieval now finds keywords within existing facet labels, respects breadth/topic boundaries, and explains these as metadata matches rather than verified causal relations.
- Source adapters strictly decode UTF-8 and BOM-marked UTF-16 while retaining byte-based source hashes; legitimate replacement glyphs are preserved.
- Stale or newly private evidence invalidates the entire merged suggestion until refresh, preventing another source from inheriting unsupported labels.
- Chinese presentation translates only program-owned explanations; author/model text and original quotes remain literal.
- Settings snapshots and cancellation prevent a mid-run consent/configuration change from silently changing the model boundary.

No release or completed native-host verification is implied by this draft entry. GitHub publication, exact-commit CI and downloaded-asset checks must be recorded before this is promoted to a dated release.
