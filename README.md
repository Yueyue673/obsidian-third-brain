# Third Brain

Reconnect a half-formed idea with notes you already wrote — with explanations and original quotations, inside Obsidian.

[中文说明](README.zh-CN.md) · [Getting started](docs/GETTING-STARTED.md) · [Privacy](docs/PRIVACY.md) · [Architecture](docs/ARCHITECTURE.md)

**Release candidate:** local gates and synthetic-harness checks are available; native Obsidian acceptance and live AI-provider checks are still pending. See the precise [verification scope](docs/VERIFICATION.md).

## Install

Desktop Obsidian **1.11.5 or newer**. This plugin is not yet listed in the Community directory.

1. Download `main.js`, `manifest.json` and `styles.css` from a GitHub release whose tag matches the manifest version.
2. In a **disposable test vault first**, create `.obsidian/plugins/third-brain/` and place the three files there.
3. Enable the plugin in Settings → Community plugins, open **Third Brain**, and choose **Refresh notes**.

No account, proprietary server or API key is needed for the default local-excerpt mode. Obsidian community plugins execute with broad access; review the code and use a backup before enabling any plugin in an important vault.

## One useful path

Type an idea, choose an association breadth if needed, and select **Find connections**. Results show the fragment, why it was retrieved, its original quotation and **Open original**. You do not need to know a tag or find an old note first.

<img src="docs/images/test-harness-activation-zh.png" alt="Actual synthetic-vault browser harness, not an Obsidian screenshot or live AI demonstration" width="540">

*Actual synthetic-vault harness using the production renderer, controller and file adapters. Not a native Obsidian screenshot; declared sample facets and local excerpts, not live AI.*

- **Separate editing layer.** Originals remain read-only. Generated Markdown and its index live under the configured generated folder; existing user-authored or edited files are protected.
- **Explainable connections.** Content, topics, concepts and shared mechanisms are separate retrieval signals. High breadth permits analogies with caveats; it does not relax evidence validation.
- **Quiet maintenance.** Manual by default; optional daily/weekly refresh only while Obsidian is open. No automatic insertion, keystroke stream, click learning or telemetry.

The plugin cannot create useful personal knowledge from an empty vault. Start with your own notes, or try the explicitly synthetic [sample vault](fixtures/sample-vault).

## Choose the processing boundary

| Mode | What happens | Requirements |
| --- | --- | --- |
| Local excerpts — default | Extracts readable passages; searches lexical signals and existing facets. **This is not AI semantic understanding.** | No network or key |
| Local model | An OpenAI-compatible model edits grounded fragments and interprets your query. | Explicit loopback endpoint and model name |
| Cloud model | Ordinary notes and your query may go to your configured provider. local/private sources and their vocabulary are excluded. | HTTPS endpoint, host-managed secret, explicit consent |

AI can make mistakes. Source validation proves that an attached quotation exists, not that every interpretation is true. Common-PII redaction is not a comprehensive privacy guarantee. See [privacy boundaries](docs/PRIVACY.md), [model setup](docs/GETTING-STARTED.md) and [known limits](docs/COMPATIBILITY.md).

## How it stays bounded

```text
Read immutable sources → check privacy → extract or ask the configured model
    → validate schema and exact quotes → reconcile fragments
    → verify sources again → commit owned derived files

Idea → optional bounded facet interpretation → local ranking
    → verify live source evidence → show explanation → open original
```

Source changes invalidate old evidence. Missing sources do not remain clickable recommendations. The plugin does not decide whether your old knowledge is still correct or whether you have mastered a subject.

## Develop

Node **22.12+**, npm, no real personal vault required:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run smoke
npm run privacy:check
npm run release
```

`npm run demo` serves a **synthetic-only test harness** on loopback. It shares the real renderer/controller/filesystem path; it is not an Obsidian window and is never presented as one. `.local/` is ignored by git.

[Architecture](docs/ARCHITECTURE.md) · [Verification scope](docs/VERIFICATION.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Research](docs/RESEARCH.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

## Licence

MIT. Independent implementation; no competitor or private-vault code is copied. The Obsidian host is a separate product. Dependency details are in [third-party notices](THIRD-PARTY-NOTICES.md).
