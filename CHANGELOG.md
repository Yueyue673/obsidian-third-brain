# Changelog

These releases are desktop previews. Version-specific test results and outstanding checks are recorded in [Testing status](docs/VERIFICATION.md).

## Unreleased

- Open Markdown originals in editing view and select/scroll to the verified quotation, including later and repeated passages. Keep original text unchanged; do not apply saved offsets to a different unsaved draft. Explain when only file opening was possible. Canvas still opens at file level; native Obsidian navigation remains unverified.

- Distinguish a completed refresh with no usable fragments from first use, including after reopening the panel. Explain whether no sources were included or included notes yielded no fragments, and suggest changing notes/settings before refreshing again. Failed or cancelled updates keep their own status; no extraction, privacy or source checks change.

- Show a waiting status and the existing Cancel button while the current note is being read. Cancelling ignores its pending result and keeps the previous idea; the underlying local read may still finish. Editing, explicit search and refresh remain available, with no automatic search or change to full-draft privacy checks.

- Ignore late current-note replies once a newer search or index refresh has begun. A delayed read can no longer replace the idea/privacy state during refresh, or overwrite refresh failure/cancellation guidance. Retrying the current note remains explicit and preserves full-draft privacy checks.
- Distinguish an unreadable or unavailable current-note source from empty context. Show safe English/Chinese retry guidance without exposing exception text; keep the previous idea, privacy and results, and still require the full draft and disk source to be checked before replacement.
- Explain when the current note or selection is too long, with guidance to select a shorter excerpt and retry. Keep the previous idea/results, the existing length limit and full-draft privacy checks; do not truncate or search automatically.
- Label retained cards and counts as previous search results when the idea is edited, cleared or replaced with the current note. Keep their source links usable and show fresh results only after a successful search; no automatic search while typing.
- Clear previous search cards and counts after any successful note refresh, including command and scheduled updates. Keep the idea and selected property for the next search; failed or cancelled updates retain the previous view and its source checks. No search is started automatically.
- Keep every result-card property accessible. Cards with more than 12 properties now offer a collapsible “More properties” section, so later mechanisms and atmosphere values are not silently omitted. Attribute searches and source checks are unchanged.
- Keep old result attributes from replacing an in-progress idea search. Attribute buttons pause during search/indexing and become available after completion or cancellation; source links remain usable.
- Rewrite the README, setup guide and release notes in plain language. No plugin behavior changes.

## 0.3.7 — 2026-10-06

- Fix duplicate excerpts missing from local search when their source notes have different privacy levels.
- Keep the strictest privacy setting when merging those excerpts. Local/private content remains excluded from cloud requests.
- Reject old results if any source changes, even when another private source keeps the merged excerpt private.

## 0.3.6 — 2026-10-06

- Fix idea searches missing valid results when earlier candidates have changed, disappeared or been excluded.
- Check all sources of a merged fragment before showing it or opening its original quotations. One remaining source cannot keep an outdated result usable.
- Fix asynchronous UI tests that cleaned up before refresh or search had finished.

## 0.3.5 — 2026-10-06

- Fix attribute searches stopping after stale or excluded candidates and missing later valid results.
- Keep the existing ranking and result limits. No additional model request is made to fill the list.

## 0.3.4 — 2026-10-06

- Make fragment types clickable: Method, Observation, Quote and the other existing types.
- Find material with the same stored type without asking the model to classify it again.
- Skip invalid source references before applying the result limit. Type matching does not add indirect suggestions.

## 0.3.3 — 2026-10-06

- Search directly by the topic, concept, mechanism or atmosphere selected on a result card.
- Keep the selected attribute when changing breadth; clear it when editing the idea or using the current note.
- Explain when a selected mechanism or atmosphere needs a wider search range. Attribute clicks do not make another model request.

## 0.3.2 — 2026-10-06

- Show which note blocked an update and whether the error occurred while reading, parsing or analysing it.
- Show reading progress and stop before the next note when cancelled. Ignore late results from cancelled tasks.
- Distinguish processing from saving. Report first-run failures and failed saves without claiming that a usable old index always exists.
- Preserve detailed error notices across refresh and search, and clear them after the problem is resolved.

## 0.3.1 — 2026-10-06

- Put up to two high-breadth indirect suggestions in a separate section so they are not hidden by the main search results.
- Show the main and additional result counts without changing the main list's scores or order.
- Recheck both original sources when opening an indirect suggestion. An edited source invalidates old source buttons.

## 0.3.0 — 2026-10-06

- Add one-step indirect suggestions at High breadth, using existing fragment links and shared mechanisms.
- Show the starting fragment, shared mechanism and quotations from both notes.
- Keep Low/Medium searches and direct scores unchanged. No new model request is made to analyse the relationship.

## 0.2.1 — 2026-10-06

- Give AI editing a short section heading and nearby text for context.
- Keep quotations tied to the passage being edited; background text cannot be used as its evidence.
- Refresh older AI editing results once for the new context policy, then reuse unchanged notes as before. Local excerpts are unchanged.

## 0.2.0 — 2026-10-06

- Save links between generated fragments, with explanations based on shared topics, concepts and mechanisms.
- Add **Open fragment** to search cards and readable titles to generated links.
- Upgrade generated notes without overwriting manually edited files.
- Add direct preview downloads and a four-file installation guide in English and Chinese.
- Add controller cancellation and source-vocabulary integration tests without changing runtime behavior.

## 0.1.0 — 2026-10-05

- Initial desktop preview: one sidebar, local excerpts and optional model modes.
- Search text and existing note attributes, with source quotations and original-note links.
- Keep original notes read-only and generated material in a separate folder.
- Add manual/daily/weekly indexing, cancellation, source-change checks and recovery for interrupted updates.
- Exclude local/private material from cloud requests; store API keys through Obsidian's secret storage.
- Add English/Chinese UI, sample notes, build instructions, MIT licensing and installable release files.
