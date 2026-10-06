# Privacy

Third Brain runs in local-excerpt mode by default. That mode makes no model requests. Cloud processing is opt-in, and the plugin does not collect clicks, dwell time or typing history.

[中文](#中文) · [Model setup](GETTING-STARTED.md#optional-model-setup)

## What can be sent to a model

In cloud mode, ordinary note text and explicitly submitted searches may be sent to the provider you configure. Requests can also include existing labels and a short section heading or preceding passage to help with editing. The provider's data-retention policy is separate from the plugin.

The plugin does not attach source IDs, filenames or paths as request metadata. Names and paths written inside note text may still be sent if redaction does not recognise them. Redaction uses patterns; it cannot find every secret or confidential detail.

## Keep notes out of cloud requests

Set `privacy: local` or `privacy: private` in a note's properties. `sensitivity: local` and `sensitivity: private` are also accepted. You can exclude a file or folder in the plugin settings instead.

```yaml
---
privacy: local
---
```

These notes and their derived labels are excluded from cloud indexing and query vocabulary. **Use current note** also respects the stricter privacy setting from the saved note or current draft. An excerpt shared by several notes keeps the strictest of their privacy levels.

Set privacy before the first cloud update. Marking a note private later cannot recall text already sent to a provider. A local model service may forward requests elsewhere independently; check that service's settings too.

## Checks before sending

The source text, privacy and exclusions are checked before each model request, including each paragraph or chunk of a long note. The sources behind labels are checked too. If a required source changes, disappears or becomes protected, that request is stopped.

Query vocabulary is rechecked against its sources before sending. Generated files do not supply cloud vocabulary. These checks reduce the chance of sending outdated or newly protected content, but another process can still edit a file between the check and the request. The filesystem checks are not atomic.

High-breadth indirect suggestions are calculated locally from existing links; they do not trigger an extra request to analyse the relationship. Opening either original rechecks both sources. The search itself may still make the query-interpretation request allowed by your selected model mode.

## Files kept in the vault

Generated fragments, the index and history can contain quotations from your notes. The plugin does not encrypt them. Vault sync and backups may include them.

Removing a source takes it out of active recommendations, but does not guarantee deletion of every historical excerpt. The plugin never deletes original notes. Disabling it stops processing, not storage or backup retention.

## API keys and model output

API keys are kept in Obsidian's secret storage. Plugin settings store only the secret identifier, not the key. Other plugins and authorised processes are outside this protection: Obsidian plugins have broad access to the host.

Models are not given tools or permission to name files, write originals or make additional network requests. Invalid output and unsupported quotations are rejected. A quotation proves where text came from, not that a summary or analogy is correct.

## Request format

The model's user message contains `task`, redacted `text`, bounded `vocabulary`, and optional editing `context` with `heading` and `before`. Editing context is limited to a 160-character heading and 400 characters of nearby text from the same section or chunk. It is redacted first and cannot supply quotations for the main passage. Filenames and arbitrary frontmatter are not used as headings.

Cloud mode requires HTTPS, a host-managed secret and explicit consent. URLs with embedded credentials, query strings or fragments, and redirects, are rejected.

## Bug reports

Do not attach private notes, searches, generated history, raw model replies, keys or personal machine paths to a public issue. Use a small sample note and the steps to reproduce. See [Security](../SECURITY.md).

---

## 中文

### 默认行为

默认「本地摘录」不调用模型，也不发送笔记。云端处理需要手动开启。插件不收集点击、停留或输入历史。

### 云端会收到什么

开启云端后，普通笔记正文和主动提交的搜索输入可能发送给所选服务商。请求还可能包含已有标签，以及用于提炼的短章节标题和附近前文。服务商如何保存这些数据，取决于其隐私政策。

请求不附加来源 ID、文件名或路径元数据，但正文里写出的名字、路径或机密信息不一定都能被识别和遮罩。自动脱敏不能替代你对笔记隐私的判断。

### 不想发送的笔记

在笔记属性里设置 `privacy: local` 或 `privacy: private`，也支持 `sensitivity: local` 和 `sensitivity: private`。还可以在插件设置中排除文件或文件夹。

这些笔记及其生成标签不用于云端请求。「使用当前笔记」也会读取原稿和草稿的隐私设置，并采用较严格的一项。一个片段来自多篇笔记时，同样保留最严格等级。

请在第一次云端更新前设置隐私。之后再标私密，不能撤回已经发送的内容。本机模型服务是否转发请求，也需要自行确认。

### 发送前的检查

每次模型请求前都会检查相关来源、隐私和排除设置，长笔记的每个段落或分块也分别检查。标签的来源同样需要有效。相关来源已改动、消失或变成私密时，请求会停止。

这些检查不能消除所有并发修改风险：其他程序仍可能在检查后、发送前改动文件。高发散的间接建议在本地计算，不另发关系分析请求；搜索输入是否交给模型解释，仍取决于你选的模式。

### 本地文件

生成片段、索引和历史可能包含原文摘录，没有加密，也可能进入笔记库的同步和备份。移除来源不保证抹除所有旧摘录。停用插件会停止处理，但不会清空已生成的文件和备份。插件不删除原笔记。

### 密钥与模型

API 密钥由 Obsidian 的密钥存储管理，插件设置只保存标识。这个机制不能阻止其他已获权限的程序或插件访问主机。

模型不能调用工具、指定输出文件、修改原笔记或自行增加网络请求。格式不对或引文无法对上的输出会被拒绝；引文有出处，不代表模型解释正确。

### 提交问题

不要把真实笔记库、搜索输入、生成历史、密钥或原始模型回复上传到公开 Issue。请使用示例笔记复现，安全问题见[SECURITY.md](../SECURITY.md)。
