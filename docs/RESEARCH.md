# Discovery notes

Read on 2026-10-05. These are implementation references, not completed-product claims.

## Official host references

- https://docs.obsidian.md/plugins/guides/secret-storage
  - Store only a secret identifier in plugin settings. Select with SecretComponent and retrieve through app.secretStorage.getSecret.
  - This avoids keeping the key in a syncable plugin data.json. It does not establish a blanket encrypted-at-rest guarantee; state the actual host boundary accurately.
- https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
  - SecretStorage and SecretComponent's setValue/onChange are marked since 1.11.4. If used unconditionally, minAppVersion must be at least 1.11.4.
- https://github.com/obsidianmd/obsidian-sample-plugin
  - A plugin release consists of main.js, manifest.json and styles.css. Version tags use the exact manifest version without a v prefix. versions.json maps plugin releases to their minimum host version.
  - Publishing a GitHub release and being accepted into the community directory are different events.

## Tested toolchain

Source navigation follow-up (2026-10-06): the [official Editor guide](https://docs.obsidian.md/Plugins/Editor/Editor) describes the public editor abstraction for Markdown editing mode. The pinned SDK declares `WorkspaceLeaf.openFile` with `OpenViewState.state`, `MarkdownView.getMode`, `Editor.setSelection` and `Editor.scrollIntoView`. Source builds request editing mode, check the actual view and full editor revision, then use only selection/scroll APIs. No private CodeMirror internals, source writes or inferred Canvas node positions are used. API-shell tests are not native navigation evidence.

Development dependencies are the exact versions in `package.json` and `package-lock.json`. The tested combination is deliberately pinned rather than assumed to be the newest. Full direct and transitive declared-licence inventory is linked from [third-party notices](../THIRD-PARTY-NOTICES.md).

## Ecosystem evidence and scope

The maintained Smart Connections, Copilot and Smart Second Brain repositories and exact-release licences were read from primary sources. See [research evidence](RESEARCH-EVIDENCE.md) for canonical URLs, dated release metadata, what each project teaches us, and which behaviours Third Brain deliberately does not adopt.

An idea-first sidebar, host-independent TypeScript core, owned-file desktop adapters and an explicit zero-model basic mode are implemented. Native installation and real-provider quality remain separate pending checks in [verification](VERIFICATION.md). Do not market competitors as missing capabilities or turn unvalidated linguistic/recall claims into guarantees.
