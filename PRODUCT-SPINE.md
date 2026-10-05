# Third Brain — product spine

## Promise

When a note-taker has a half-formed idea and scattered notes, Third Brain brings back source-grounded fragments and explains both direct and mechanism-level connections, without rewriting the user's notes or interrupting composition.

## Priority order

1. Preserve user originals. Only an explicitly owned generated layer may be changed; never infer ownership from a folder name alone.
2. Preserve provenance and uncertainty. A quotation must occur in the source; an inferred relationship is labelled as a suggestion, not a fact.
3. Make activation useful before making a graph attractive. A natural-language idea and clickable tags are valid entry points; a blank page has no invented context.
4. Stay quiet and controllable. Manual, daily or weekly maintenance; no operating-system monitoring, click tracking, dwell tracking or behavioural profiling.
5. Keep scope small. One Obsidian plugin, one activation surface, a low/medium/high association control, no proprietary service requirement.

## First value slice

A user installs the release in a disposable vault, indexes a set of synthetic notes, types a vague idea without having to name tags, sees relevant fragments with original quotations and relationship explanations, opens the correct original, and reruns maintenance without duplicate fragments or changed originals.

## Requirements and evidence gates

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| P01 | Originals and generated material remain separate. | Before/after hashes of all original files are identical; existing unowned files in the generated area are untouched. |
| P02 | Long notes yield multiple useful fragments. | Synthetic multi-section note retains independent later-section information; overlap does not duplicate fragments. |
| P03 | Every fragment has program-controlled provenance. | Exact relative source path, content revision and a quotation validated against the input. Model-proposed paths/commands are rejected. |
| P04 | Connections include content and mechanism, not just identical words. | Held-out synthetic cross-domain examples plus explicit negative examples; explanations identify the shared mechanism and source evidence. |
| P05 | Themes, concepts, mechanisms and other meaningful facets support retrieval. | Clickable facets return existing fragments. Existing vocabulary is reused; aliases do not create a noisy tag explosion. |
| P06 | Association breadth is low/medium/high. | The control changes candidate scope, never quotation validation, privacy or confidence labels. High breadth cannot invent relationships. |
| P07 | Maintenance is incremental and idempotent. | Unchanged source hashes cause no model calls or duplicate outputs; edits reconcile owned fragments; failed analysis preserves the last complete revision. |
| P08 | Similar notes improve rather than multiply identical material. | Within-source deduplication and cross-source similarity preserve distinct evidence and multiple provenance rather than silently discarding originals. |
| P09 | Sparse information can abstain. | Empty notes and ambiguous one-liners yield an honest insufficient-context state, not fabricated tags or claims. |
| P10 | Activation works from an idea, not only from browsing old notes. | Natural-language query and an explicitly requested current draft return source-grounded candidates without requiring tag syntax. |
| P11 | Composition is uninterrupted. | No automatic insertion into user notes, modal recommendation popups or keystroke stream; suggestions are opt-in and shown in one surface. |
| P12 | Daily/weekly updates are quiet, initial value visible. | Manual initial indexing, visible progress/cancel, overdue refresh when Obsidian opens, no daemon or monitoring outside the app. |
| P13 | Historical knowledge retains context. | Source revision and relevant date shown; removed/changed sources become unavailable/stale instead of live links; no false claim of knowing mastery. |
| P14 | Privacy precedes model calls. | Explicit cloud consent; local/private sources never sent to cloud; credentials blocked and PII redacted before request; no document bodies in logs. |
| P15 | Model output is untrusted. | Strict schema, evidence/path constraints, injection tests, bounded responses and fail-closed validation. |
| P16 | Writes are owned, bounded and recoverable. | Path traversal/symlink/ownership tests, source compare-and-swap, staged transaction, recovery from interrupted write and cancel. |
| P17 | Zero-cloud basic mode is real. | A usable local lexical/facet baseline works without a key; optional AI mode is clearly distinguished from the baseline. |
| P18 | Publication is reproducible and honest. | Release assets install from a fresh checkout, CI and downloaded hashes are verified, real screenshots, Chinese/English documentation and limitations. |

## Non-goals

- Generating a replacement author, writing essays for the user or modifying original note content.
- Always-on OS sensing, click-based learning, private data uploads without informed consent.
- Claiming proven recall improvement, perfect associations, verified linguistic precision or knowledge mastery without evidence.
- Deleting user notes, expanding into a chat assistant, publishing personal note examples or building a new notes app.
- Claiming community-directory acceptance merely because a GitHub release exists.

## Design decisions to validate

A native Obsidian plugin is the preferred distribution shape. Evaluate a browser-compatible TypeScript core and host-native file/network/secret adapters against existing ecosystem evidence before finalising implementation. Preserve proven safety mechanisms from the private implementation as new, general-purpose code, not a wholesale copy of machine-bound scripts.

## Evidence status

Implementation and external product validation are not yet complete. This document defines the acceptance contract, not completed claims.
