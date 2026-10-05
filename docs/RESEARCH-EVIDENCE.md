# Research evidence and architecture choices

Primary repository documents and release metadata were read on **2026-10-05 at 00:37 UTC**. Competitor statements describe maintained documentation, not independently tested behaviour or superiority. Default-branch documentation, release tags, SDK package versions and installed host versions are separate evidence.

## Existing ecosystem

| Primary source | Observed release | What we learn | What we do not adopt |
| --- | --- | --- | --- |
| [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) | [4.7.2](https://github.com/brianpetro/obsidian-smart-connections/releases/tag/4.7.2), 2026-08-06 | Documented local embeddings, connections, Lookup and first-use guidance already address related-note discovery. Activation is an existing category. | No claim that competitors lack semantic discovery or continuous workflows; no copied implementation. |
| [Copilot](https://github.com/logancyang/obsidian-copilot) | [4.0.13](https://github.com/logancyang/obsidian-copilot/releases/tag/4.0.13), 2026-10-02 | Its documented agent, selection actions and provider disclosure show why action and processing boundaries need to be explicit. | Third Brain stays an editing/index layer, not an autonomous author, chat platform or tool-executing agent. |
| [Smart Second Brain](https://github.com/s2b-dev/smart-second-brain) | [2.3.0](https://github.com/s2b-dev/smart-second-brain/releases/tag/2.3.0), 2026-09-28 | Documented search, graph, local defaults and optional AI distinguish basic value from requiring a model. The former `your-papa/obsidian-Smart2Brain` repository redirects here. | A graph must not replace the idea → fragment → original journey; no agents modifying originals. |
| [Official sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin) | Host/release reference | Native lifecycle, host primitives, repository clarity and the three-asset installation shape. | No companion server; GitHub publication does not imply community-directory acceptance. |

These are behaviour, scope, presentation and host-integration references. The combination under test is a separate owned editing layer, exact source evidence, explainable facet/mechanism suggestions and quiet explicit activation. Whether users find that combination more useful remains unvalidated.

## Licence checks at exact tags

- [Smart Connections 4.7.2](https://github.com/brianpetro/obsidian-smart-connections/blob/4.7.2/LICENSE): Smart Plugins License Agreement includes competition restrictions; it is not treated as ordinary MIT. No code copied.
- [Copilot 4.0.13](https://github.com/logancyang/obsidian-copilot/blob/4.0.13/LICENSE): AGPL-3.0. No code copied.
- [Smart Second Brain 2.3.0](https://github.com/s2b-dev/smart-second-brain/blob/2.3.0/LICENSE): MIT. Still a product/documentation reference, not implementation source.

Each tagged licence matched its default-branch counterpart when checked. Third Brain is independently authored under MIT; development dependencies keep their own licences. See [third-party notices](../THIRD-PARTY-NOTICES.md).

## Official host contract

The [API declarations](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) mark `App.secretStorage`, `SecretStorage` and the used `SecretComponent.setValue/onChange` methods `@since 1.11.4`. The component class itself is older; method availability is what matters. This project declares minimum host **1.11.5** and pins SDK package **1.13.1**. Neither a package version nor declarations establish live-host compatibility.

Settings store only a secret identifier; values are retrieved with `app.secretStorage.getSecret`. There is no plaintext-key fallback. This identifies a host-owned boundary, not a blanket encryption/privacy guarantee.

The [official release instructions](https://github.com/obsidianmd/obsidian-sample-plugin#releasing-new-releases) require the exact manifest version as the tag without `v`, release attachments `main.js`, `manifest.json`, `styles.css`, and aligned root manifest/`versions.json`. Community-directory review is separate.

## Chosen architecture and reasons

1. **Idea-first sidebar.** Users should not need known tags or graph browsing before finding old material. Facet clicks are shortcuts after results exist.
2. **Portable core, desktop adapters.** Extraction/retrieval/privacy logic is directly testable; filesystem journals and bounded Node transport sit at explicit side-effect boundaries. The current plugin is desktop-only.
3. **No-key local excerpts by default.** Basic value uses zero model requests. It searches real text and existing labels, not semantic AI. A metadata-word match gets its own explanation and cannot prove causality.
4. **Optional bounded model editing.** Untagged notes may receive constrained new facets and editorial summaries. Exact quotations and provenance stay program-controlled. Query interpretation can only select existing safe vocabulary; model quality remains empirical.
5. **Quiet incremental maintenance.** Manual/daily/weekly while Obsidian runs; unchanged revisions are reused. No OS sensing, click learning or keystroke stream.
6. **Owned derived files and explicit limits.** Originals stay read-only. Only index-state swap is atomic; files are journal-applied individually. Platform/crash/TOCTOU limits and retained history are stated, not hidden behind a durability guarantee.

Themes, concepts, mechanisms and atmosphere are pragmatic retrieval axes. No validated linguistic taxonomy, perfect relevance, recall improvement or mastery model is claimed. Exact quotations establish provenance, not every interpretation.

Local proof, native-host installation, real-provider evaluation, exact-commit matrix CI and downloaded release installation are tracked separately in [verification](VERIFICATION.md). No competitor was independently installed or benchmarked for this project.
