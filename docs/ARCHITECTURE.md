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

Read each original once into an immutable snapshot. Classify local/private and sensitive input before conversion or model calls. Use unchanged source hashes and a generation signature to avoid repeated model work. Build and validate the complete next revision before source recheck and owned commit. A failed analysis never returns a partial next revision. During filesystem commit, only the index state swap is atomic; see the journal/recovery limits below.

## Activation

A natural-language idea is the primary input. Optional authorised model interpretation supplies bounded facets; local ranking uses content plus topics, concepts, mechanisms and atmosphere. Breadth changes eligible association channels, not privacy/evidence rules. A no-signal query produces no recommendations.

Before displaying or opening a quotation, check the current source revision, source identity and exact quotation span. Missing or changed evidence is not presented as an active reference. Multiple provenance is preserved when exact excerpts merge.

High breadth can reuse the existing render-v2 network calculation for a bounded, same-privacy one-hop suggestion from a direct mechanism/analogy seed: at most 3 seeds, 3 inspected neighbors each and 6 targets. Only shared mechanism edges qualify; neighbors cannot become seeds. Direct scores receive no bonus, and pure indirect scores stay below all direct matches. Both full endpoints carry source evidence, conditions and caveats and are rechecked for indexed membership, revision, identity, exact quotation, privacy and exclusions. The UI provides separate source buttons. Query-only metadata is not persisted; network/render bytes, schema and generation policies are unchanged. The seven-result panel can omit low-ranked indirect candidates. Repeated checks narrow but cannot eliminate check-to-use races because SourcePort does not offer atomic pair reads.

## Storage and sync

Derived Markdown is visible; reserved state and history are hidden. The validated **index state swap** is atomic; generated Markdown files are journaled and applied individually. A file browser or sync tool may therefore observe a mixture while commit/recovery is in progress. This is not an atomic swap of the entire folder. Recovery failure blocks the plugin rather than reporting success.

Portable Node file APIs do not provide compare-and-rename against every hostile filesystem race. Windows directory fsync is skipped; the journal/crash tests do not establish immunity to all power-loss or external-process interference. New stores bind an authenticated stage/backup inventory to the local marker, output folder and transaction; cleanup checks each file's expected hash. Unrecognised or edited artifacts and unverifiable legacy orphans are retained. Prospective work filenames are not cleanup ownership evidence. Unchanged authenticated staging can be pruned after finalization or on the next locked run; an unknown remnant preserves its directory. The marker is a local trust anchor, not protection against an actor able to rewrite all metadata. Retired fragment history is retained and not automatically compacted.

Secret values are held by Obsidian, with only their IDs in plugin settings. Hidden state is not encryption. Generated excerpts and history may contain note text, so users must review their sync/backup boundaries.

No telemetry, click history, dwell model, per-keystroke inference, mastery profile, remote index service or OS watcher is used.

## Runtime compatibility

The pure core can run in browsers, but production filesystem/network adapters require Node in desktop Obsidian. The manifest therefore declares `isDesktopOnly: true`; mobile support is not implied by a responsive sidebar or a browser test harness.
