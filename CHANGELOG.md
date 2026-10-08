# Changelog

These releases are desktop previews. Version-specific test results and outstanding checks are recorded in [Testing status](docs/VERIFICATION.md).

## Unreleased

- Ignore an older ordinary settings-save completion after a newer settings change. It no longer redraws away a later search, current-note read or composing idea; privacy and exact source-open checks remain intact. Verified with registered settings/view callbacks, English/Chinese rendering and synthetic files with controlled save timing, not native Obsidian settings or IME input. This does not establish ordering of overlapping writes to the host settings file.

- Keep the open panel's unfinished idea, privacy, breadth and selected property/type when saving plugin settings. Carry only that transient draft into the redrawn view; discard old results and pending replies, require an explicit new search, and forget the draft when the view closes. Breadth hints name the explicit search action; changing breadth alone does not submit a restored draft. No query text is saved in plugin settings. Verified through registered settings/view callbacks and synthetic files, not native Obsidian settings or IME input.

- Keep breadth changes from submitting an edited/composing idea or an unreviewed current-note fill. A pending current-note read now survives changing Low/Medium/High; explicitly submitted, unchanged ideas and selected properties/types still refine immediately. Previous cards, full-draft privacy and source-open checks remain intact. Verified through the real renderer/Main adapter with synthetic files and controlled read timing; native Obsidian behavior remains unverified.

- Treat starting composition in the idea box as a new editing intent: retain and label previous cards, ignore late search results, and leave any selected property/type filter before the first input event. Search remains explicit and keeps current-note privacy and source-open checks. Verified with the real renderer/Main adapter and synthetic filesystem tests; native Obsidian IME ordering remains unverified.

- Ignore a pending Use current note reply as soon as composition starts in the idea box, even before an input event or when composition ends without inserting text. Late success or failure no longer replaces the idea/privacy or adds an obsolete notice; a fresh explicit fill/search still works. Verified through the registered panel and synthetic filesystem/host-API tests; native Obsidian IME event ordering remains unverified.

- Keep a delayed Use current note read from taking focus back after returning to the editor, switching controls or continuing input/composition. The requested text still fills the idea box with full-draft privacy, but does not search automatically. Cancel/edit/close and newer requests retire temporary focus guards. Verified through the real panel and synthetic filesystem/host-API tests; native Obsidian focus and IME behavior remain unverified.

- Focus the idea box when explicitly opening Third Brain from its command or ribbon icon, without clearing the idea, selection or results or starting a search. Restoring/redrawing the sidebar never requests focus; delayed opens yield to continued typing/composition, newer focus, close or unload. Verified through the registered view, renderer and synthetic filesystem/host-API tests; native Obsidian focus behavior remains unverified.

- Show an English/Chinese hint below the idea box: Enter adds a line; Ctrl/Command+Enter finds connections. Associate the description and shortcut metadata with the input for assistive technology, without adding a control or changing key handling. Verified with the real renderer and synthetic filesystem/host-API tests; native keyboard and screen-reader behavior remain unverified.

- Prevent held Ctrl/Command+Enter from starting another search after completion or cancellation. A fresh press can still retry the same idea; ordinary Enter, input-method composition and current-note privacy stay unchanged. Verified with synthetic key-repeat events through the real panel and local file pipeline, not native keyboard input.

- Keep Ctrl/Command+Enter from submitting unfinished text when the input method reports active composition. Finish composing and search explicitly; ordinary Enter, completed shortcuts, busy-search protection and current-note privacy stay unchanged. Verified with synthetic keyboard events through the real panel and local file pipeline, not native IME input.

- Clarify the English/Chinese current-note instructions: fill the idea box, review it, then click Find connections. Documentation only; explicit search and full-draft privacy checks are unchanged.

- Show why automatic updates remain paused after cancelling a refresh, including after searching or reopening the panel. The English/Chinese status names the existing Refresh notes action and clears after a successful manual refresh or plugin reload. Manual-only schedules show no pause hint; failed retries and pending file cleanup keep their own diagnostics. No new control, stored setting or scheduling behavior. Verified through synthetic filesystem and host-API tests, not native clicks.

- Keep cancelled note refreshes stopped: daily/weekly checks no longer restart them on the next tick, even after a search or settings save. Automatic updates pause for the current plugin session until a manual refresh succeeds; reloading the plugin still catches up overdue work. Cancelling a search does not pause maintenance. No success timestamp, source/ownership check or transaction outcome is fabricated. Verified through the real scheduler and synthetic filesystem/host-API tests, not native clicks.

- Acknowledge Cancel immediately while a note refresh waits for file work or rollback. Keep the task busy and disable repeated cancellation until it settles; saving-stage feedback explicitly leaves the save outcome unconfirmed. Reopening the panel preserves that feedback. No early unlock, hard I/O interruption, automatic retry or transaction change. Verified in English/Chinese with synthetic commit-boundary latches, real files and host-API shells, not native clicks or actual stalled disks.

- Explain temporary generated-layer contention when retrying a cancelled search, refreshing, or opening a previous result: wait and retry without deleting lock/index files. Clear the notice after a successful explicit retry. Trusted lock refusals stay distinct from missing, edited or invalid files; no automatic retry, early unlock or weaker evidence checks. English/Chinese guidance is verified with synthetic file-open latches and host-API shells, not native clicks or actual stalled disks.

- Let Cancel finish an idea, attribute or type search while it waits for local generated-layer checks, including the pre-request vocabulary check. Ignore late replies without releasing the store's lock, skipping validation or changing ranking. The underlying file check may still finish and temporarily block a retry. Verified with synthetic file-open latches and host-API shells, not native clicks or real stalled disks.

- Explain known missing or protected generated files when Find connections is blocked, including attribute and type searches. Preserve the idea and previous results without treating them as a new answer; reuse English/Chinese recovery guidance without exposing raw errors or claiming the saved index is safe. Search ranking and ownership/source checks are unchanged. Verified with synthetic files and host-API shells, not native clicks.

- Explain missing or protected generated files directly when refreshing notes or loading the plugin, including command and quiet scheduled refreshes. Share safe English/Chinese recovery guidance across panel and host notices; preserve original error identity, source diagnostics and uncertain commit outcomes without claiming a damaged saved index is usable. Storage/ownership guards are unchanged. Verified with synthetic files and host-API shells, not native clicks.

- Explain missing or protected generated files when Open fragment is refused, with English/Chinese guidance to preserve the folder and inspect a test copy rather than force a refresh. Keep ownership validation and human edits intact, distinguish unavailable old results from unknown failures, and prevent late fragment-open replies from replacing newer notices. Verified with synthetic files and host-API shells, not native clicks.

- Explain when a displayed result's source evidence is no longer current or available: review source changes/exclusions, refresh notes, then search and open a new result. Keep full source checks and unknown error identities; old source-open replies no longer replace newer search or structured refresh notices. English/Chinese guidance is verified through synthetic filesystem and host-API tests, not native Obsidian clicks.

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
