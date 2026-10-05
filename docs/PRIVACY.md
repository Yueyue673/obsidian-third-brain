# Privacy and data boundaries / 隐私边界

## Default

Local excerpts make no model requests. Processing mode is never silently upgraded. Model modes use only an explicitly configured endpoint. No telemetry or behavioural profile is collected.

默认本地摘录不调用模型。点击、停留、逐键输入不用于训练或画像。使用当前笔记是一次明确请求，不是持续监控。

## Cloud consent

Cloud mode needs explicit consent, HTTPS and a host-managed secret. Ordinary note text and explicitly submitted queries may be sent to that provider. The provider's retention and privacy terms are separate from this plugin.

The user-message data supplied to the model contains only `task`, redacted `text` and bounded `vocabulary`. The plugin does not attach source identifiers, filenames or paths as metadata. Paths or filenames mentioned within the text are masked only when they match conservative patterns; some bare filenames, such as CSV or spreadsheet names, may remain in the body. This is not comprehensive filename/path anonymisation.

模型请求不附加来源 ID、文件名或路径元数据。正文里的路径和文件名仅按有限模式遮罩；例如某些 CSV、表格文件名仍可能原样发送。未识别的机密内容也可能保留，应在首次云端处理前标记 local/private 或排除来源。

## local/private

Supported source frontmatter includes `privacy: local`, `privacy: private`, `sensitivity: local` and `sensitivity: private`. Classify raw input before Markdown/Canvas/plugin-format conversion. Cloud indexing and cloud vocabulary omit non-normal sources and derivatives. Current-note/query context inherits the stricter source/draft privacy; no raw private context is interpreted by a cloud model.

This policy is prospective. Changing a previously ordinary note to private cannot recall content already sent to a provider. A loopback model service may independently forward traffic; endpoint validation does not audit that separate process.

Cloud requests are re-checked **at each request boundary**, not only at the last refresh or once per note. Every paragraph and oversized-paragraph chunk is a separate extraction request. Before it, the live source proof for each vocabulary label is checked again, including metadata, cached and newly inferred labels; the active note is read last, after asynchronous dictionary checks. A missing, excluded, edited or newly protected required source aborts the run before that request. An independently grounded ordinary source can supply a shared label; a merged fragment's unioned labels still require all of its evidence donors. Local excerpts make no model requests and do not need these outgoing-request checks.

For interpreted queries, candidate dictionary donors are re-read and re-verified before sending. Newly excluded folders and the owned derived layer stop contributing immediately. These checks narrow the check-to-send window; they cannot eliminate it on a filesystem another process can edit at any moment. They also cannot recall previously authorised data sent before a policy change.

## Sensitive content

Recognised credential-bearing input blocks a model request. Common identifiable information is redacted where safe evidence mapping is possible. This is a conservative pattern-based measure: it does **not** recognise every secret, identity or confidential situation. Mark sensitive notes local/private or exclude their folder before first indexing.

脱敏不能替你识别所有隐私；来源中含有未识别的隐私，仍可能在明确启用云端后发送。应先设置 local/private 或排除文件夹。

## Local copies

Generated fragments, index and retired history can include excerpts. They are not encrypted by this plugin and may be included in vault backups/sync. Removing a source retires active recommendations; it is not guaranteed erasure of historical derived copies. The plugin never deletes user originals.

## Secrets

Settings keep only a SecretStorage identifier. There is no plaintext API-key fallback. Host secret storage is not a guarantee against other authorised processes or malicious plugins. Obsidian plugins have broad host access and are not permission-sandboxed.

## Model trust

No tools, output-path control, extra network actions or original-note write authority are given to a model. Unknown fields, malformed JSON and unsupported quotations fail closed. A valid quotation proves existence, not the correctness of the interpretation or present-day truth of old knowledge.

## Logs and issues

Do not attach a real vault, index/history, raw model response, query, API key, credential-bearing URL or personal absolute path to a public issue. Use a small synthetic reproduction. Safe application errors do not echo provider response bodies or note text.
