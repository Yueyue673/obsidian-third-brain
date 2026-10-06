# Architecture

One desktop Obsidian plugin, one activation surface, no companion service.

## Boundaries

- `src/core/`: host-independent source preparation, privacy policy, strict model-response schema, fragment extraction/reconciliation and local retrieval. Model output is data, never an instruction to operate files.
- `src/sources.ts`: byte-level source snapshots and SHA-256 revisions; canonical vault-relative paths; symlink rejection; source-set compare-and-swap. Originals are read-only.
- `src/runtime/store.ts`: ownership-protected derived Markdown, strict persisted state, staged writes, a validated recovery journal and generated-history handling. A folder name cannot establish ownership.
- `src/runtime/transport.ts`: bounded native HTTP(S), explicit model/endpoint selection, loopback/cloud policy, no redirects, cancellation and timeout. No implicit service or model starts.
- `src/controller.ts`: single-flight refresh/search, snapshot/config coordination, live-evidence checks and visible safe status. No model reranking of private fragments. Before a model request may carry note text, each pending source is re-read at that request boundary; cloud vocabulary is collected, re-verified and re-checked against current exclusions/donor revisions immediately before it is sent.
- `src/main.ts`: Obsidian view, settings, secret selector, source opening and app-open-only schedule.
- `src/ui.ts`: text-only DOM rendering shared by the host and a labelled synthetic browser harness. Source/model strings are not interpreted as HTML.

## Refresh

Read each original once into an immutable snapshot. Classify local/private and sensitive input before conversion or model calls. Use unchanged source hashes and a generation signature to avoid repeated model work. Build and validate the complete next revision before source recheck and owned commit. A failed analysis never returns a partial next revision. Optional source read/list/verify signals and per-source progress preserve zero-argument adapter compatibility; cancellable waits reject late results, and the production reader checks between sources/async steps. Core processing completion is not host commit completion. Trusted relative-path/stage/reason diagnostics are attached to actual source failures with a private WeakMap; external similarly named properties are ignored and original exception identity/categories are retained. Request-boundary privacy/identity/dictionary proof failures stay global, with existing bound donor I/O locations preserved. Status retains last progress and distinguishes no prior complete index, pre-commit failure and unknown commit outcome; the bilingual panel renders only controlled fields, not arbitrary exception text or model output. These diagnostics are transient: v1 state, generated Markdown, generation signature and model wire remain unchanged. During filesystem commit, only the index state swap is atomic; see the journal/recovery limits below.

## Activation

A natural-language idea is the primary input. Optional authorised model interpretation supplies bounded facets; local ranking uses content plus topics, concepts, mechanisms and atmosphere. Breadth changes eligible association channels, not privacy/evidence rules. A no-signal query produces no recommendations.

Before displaying or opening a quotation, check the current source revision, source identity and exact quotation span. Missing or changed evidence is not presented as an active reference. Multiple provenance is preserved when exact excerpts merge.

High breadth can reuse the existing render-v2 network calculation for a bounded, same-privacy one-hop suggestion from a direct mechanism/analogy seed: at most 3 seeds, 3 inspected neighbors each and 6 targets. Only shared mechanism edges qualify; neighbors cannot become seeds. Direct scores receive no bonus, and pure indirect scores stay below all direct matches. Both full endpoints carry source evidence, conditions and caveats and are rechecked for indexed membership, revision, identity, exact quotation, privacy and exclusions. The UI provides separate source buttons and preserves the existing controlled Open fragment action in both result sections. An opt-in query-only side channel retains at most six network-supported candidates before the ordinary ranking cutoff. The Controller preserves the current main seven, then checks up to two nonduplicate extra suggestions; low/medium and the default core result limit are unchanged. The summary names the extra count and the renderer separates the section explicitly. Exact rendered quotation objects are temporarily bound by WeakMap to complete one-hop proofs, so either original-source button rechecks both full endpoints and shared mechanisms, including old still-visible cards after a cancelled search. These are source-validation bindings, not click logs. Query-only metadata is not persisted; network/render bytes, schema and generation policies are unchanged. Repeated checks narrow but cannot eliminate check-to-use races because SourcePort does not offer atomic pair reads.

## Storage and sync

Derived Markdown is visible; reserved state and history are hidden. The validated **index state swap** is atomic; generated Markdown files are journaled and applied individually. A file browser or sync tool may therefore observe a mixture while commit/recovery is in progress. This is not an atomic swap of the entire folder. Recovery failure blocks the plugin rather than reporting success.

Portable Node file APIs do not provide compare-and-rename against every hostile filesystem race. Windows directory fsync is skipped; the journal/crash tests do not establish immunity to all power-loss or external-process interference. New stores bind an authenticated stage/backup inventory to the local marker, output folder and transaction; cleanup checks each file's expected hash. Unrecognised or edited artifacts and unverifiable legacy orphans are retained. Prospective work filenames are not cleanup ownership evidence. Unchanged authenticated staging can be pruned after finalization or on the next locked run; an unknown remnant preserves its directory. The marker is a local trust anchor, not protection against an actor able to rewrite all metadata. Retired fragment history is retained and not automatically compacted.

Secret values are held by Obsidian, with only their IDs in plugin settings. Hidden state is not encryption. Generated excerpts and history may contain note text, so users must review their sync/backup boundaries.

No telemetry, click history, dwell model, per-keystroke inference, mastery profile, remote index service or OS watcher is used.

## Runtime compatibility

The pure core can run in browsers, but production filesystem/network adapters require Node in desktop Obsidian. The manifest therefore declares `isDesktopOnly: true`; mobile support is not implied by a responsive sidebar or a browser test harness.

## Explicit facet activation

`FacetSelection` is a transient query-only channel/value, not a persisted state or model-wire field. Renderer, actual Main PanelPort and both demo boundaries forward it optionally; ordinary requests retain the previous three arguments. The controller rejects extra/inherited/accessor/symbol/unsafe fields, resolves the canonical safe label against a complete currently valid donor, skips model factory/interpretation and uses an empty lexical query plus that one facet channel. The natural-query branch and ranking/TF-IDF/network/display budgets are unchanged. Breadth limits still apply; high neighbors are suggestions, not strict equality.

Only this authenticated explicit four-facet path opts into `retainRankedContinuation`: a transient tail of the same once-scored, network-expanded and sorted corpus. The default core head remains 30; the Controller checks head then tail in the same score/ID order, skips known-invalid candidates and stops at main seven. It does not prefilter the scoring corpus, change IDF or rebuild the network. Unknown read/source-format/safety failures still abort the whole query rather than producing a partial result. The bounded extra-two channel and ordinary/kind paths are unchanged. This is neither a new page nor complete pagination.

Selected results pass the existing full current-evidence/index-member/source-privacy/exclusion checks. Exact rendered evidence objects bind to a cloned endpoint through a short-lived WeakMap for original opening, including cancelled-search old cards; no click history/telemetry is stored. Editing/current-note activation clears the selection and invalidates pending renderer results; changing breadth keeps the choice and uses bilingual notices at inapplicable scope. These checks narrow existing check-to-open races, not make the SourcePort atomic.

## Stored-type activation

Transient `QuerySelection = FacetSelection | KindSelection` extends the same optional fourth PanelPort/Controller argument; actual Main already forwards it, and both demo endpoints retain it. Canonical types mirror the existing strict parser without changing model input/output, persisted Fragment/Facets/IndexState/relationships or generation signatures. A complete current donor is required before selecting `SearchOptions.kind`. The kind-only donor pass retains up to the existing 30 currently valid matching candidates in stable ID order, so known stale/excluded entries cannot exhaust a cutoff before later current materials. Source read errors still fail closed; retained results/open actions revalidate, not assume an atomic source snapshot. The isolated retrieval branch requires an empty query and no facets, compares kind by strict string equality, emits a query-only `kind` classification reason, sorts deterministically by ID and applies the existing limit. Score 1 is an equal-type ordering marker, not relevance or confidence. It never invokes the lexical/facet/network branch; ordinary idea and four-facet paths are unchanged.

Result validation and a short-lived WeakMap bind full endpoint evidence plus kind to source-opening actions. Own index/source membership, current kind, identity/hash/privacy/exclusion and full provenance remain mandatory. No clicks/keystrokes are collected. The existing surface shows readable current type, same-type count/reason, honest capped/empty results and unchanged source-origin labels; it reuses selection clearing/breadth retention/cancel-late safeguards. A classification is editorial, not semantic equivalence or causality. This does not make SourcePort reads atomic.
