# Compatibility and limitations

## Declared scope

- Desktop Obsidian, minimum manifest version **1.11.5** for host-managed secret storage.
- SDK declarations pinned to npm **1.13.1**. SDK package, app runtime, installer and repository HEAD are different versions.
- Development: Node **22.12+**; CI is configured for Node 22/24 on Ubuntu/Windows. A workflow configuration is not evidence that its remote runs have passed.
- Markdown and Canvas text nodes. Drawing/compressed Excalidraw payload is not treated as prose.
- OpenAI-compatible non-streaming chat-completions endpoints. Vendor-specific APIs, tool-calling-only responses, streaming-only services and providers without the expected JSON shape are not claimed compatible.
- Mobile is not supported. The manifest declares desktop-only because production adapters require Node filesystem/network capabilities.

## Limits worth knowing

Local excerpts are a lexical/existing-facet baseline. They do not infer arbitrary cross-domain semantics. AI modes depend on the configured model and can misunderstand your notes. Evidence validation does not prove every summary or analogy.

No useful personal index can be created from an empty vault. Sparse notes can be kept without facets or abstained from rather than padded with invented context. Ranking is heuristic, not calibrated confidence, and high association breadth does not mean every candidate is useful.

The plugin does not assess present-day truth, mastery or memory improvement. Exact-content reconciliation preserves multiple provenance; nonidentical semantic equivalence is not automatically assumed.

Source and output symlinks are rejected. Excluded folders and configured note/byte limits bound work. Limits apply together: 20,000 source records, 10,000 active fragments, a 32 MiB persisted state, a 2 MiB generated file, and a 100 MiB source-text batch. The configurable source-count ceiling is not a promise that every vault of that size fits: many fragments or quotations can reach another limit first, and the complete revision then fails instead of committing a partial index. UTF-8 and explicit-BOM UTF-16 are accepted by the source adapter; invalid/unsupported decoding is rejected where detected.

Only the index state swap is atomic. Generated files are applied individually under a journal and can appear mixed during an update. Recovery and crash tests do not guarantee protection against every hostile external-file race or every power-loss scenario; see [architecture](ARCHITECTURE.md).

A daily/weekly schedule works only while Obsidian is running. No persistent operating-system service is installed.

Hidden history can retain old generated material. This release does not guarantee complete erasure after source removal; see [privacy](PRIVACY.md).

## Evidence, not implied support

Actual native-host checks, model checks, local tests and browser-harness checks are separate rows in [VERIFICATION.md](VERIFICATION.md). Read that report for what was exercised on the released commit. Do not infer native Obsidian compatibility from a successful browser harness alone.
