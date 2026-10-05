# Getting started / 上手

## First run

Use the three release assets in `.obsidian/plugins/third-brain/` of a disposable desktop vault. Enable the plugin, open its ribbon/command entry, and refresh notes once. The default mode does not contact a model.

Try the authored synthetic sample notes, then enter `留白` or `Change one variable at a time`. Inspect a quotation and open its exact original. These are controlled examples, not evidence of universal retrieval accuracy. A source with too little context can produce no fragment.

首次使用：先更新一次，再写下想法寻找关联。空白页不生成所谓关联；信息不足也允许不提炼。第一次不需要等待每天或每周的计划。

## Local model

1. Run your own OpenAI-compatible local service. Third Brain does not install or start a model daemon for you.
2. Choose Local model. Set its loopback `/v1` base endpoint and exact model name.
3. If the service requires a key, select a host-managed secret through the plugin's API key component.
4. Refresh notes, then search. Unsupported or malformed model output fails closed; the previous complete index is retained.

The default endpoint is an example only, not a claim that a model is installed. `local-model` validates a loopback destination; this does **not** prove that another process at that destination never forwards requests elsewhere.

本机接口只接受回环目的地。另一个本机服务可能自行转发请求，插件无法替它担保；请了解你使用的模型服务。

## Cloud model

Set a supported HTTPS `/v1` endpoint and model. Use Obsidian's host-managed secret selector; the plugin stores only the secret identifier. Explicitly enable cloud processing after reviewing [privacy](PRIVACY.md). URL credentials, query strings, fragments and HTTP redirects are rejected.

普通笔记和明确提交的查询可能发送到服务商。来源 frontmatter 中的 `privacy: local/private` 或 `sensitivity: local/private` 会先于格式处理和模型请求执行。

```yaml
---
privacy: local
---
```

No external request is needed to apply that policy. It is not retrospective: labelling a note private later cannot undo a provider's earlier receipt of ordinary-note content. Do not rely on regex redaction to detect every secret.

## Current-note context

Choose **Use current note** intentionally. The plugin reads an editor selection, or the current draft once, and keeps the original/draft's stricter privacy. For long notes, select a shorter passage. It does not subscribe to a keystroke stream or modify the editor.

## Scheduling

Manual is the default. Daily/weekly checks occur while Obsidian is running; an overdue refresh is caught up once. Closing Obsidian means no maintenance task runs. No background OS monitor is installed.

## Generated files and removal

The configured output folder contains owned Markdown plus reserved hidden state/history. Files are not owned just because they are in that folder. Editing generated files makes them protected conflicts; the plugin will not silently overwrite your changes.

Retired generated revisions can remain in hidden history for recovery. Hidden does not mean encrypted, and this release does **not** promise immediate erasure of all derived copies when a source is removed. Stop the plugin and review backup/sync policy if you require erasure. User originals are never deleted by the plugin.
