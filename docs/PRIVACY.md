# Privacy and data boundaries / 隐私边界

## Default

Local excerpts make no model requests. Processing mode is never silently upgraded. Model modes use only an explicitly configured endpoint. No telemetry or behavioural profile is collected.

默认本地摘录不调用模型。点击、停留、逐键输入不用于训练或画像。使用当前笔记是一次明确请求，不是持续监控。

## Cloud consent

Cloud mode needs explicit consent, HTTPS and a host-managed secret. Ordinary note text and explicitly submitted queries may be sent to that provider. Opaque source identifiers replace filenames/paths in model input. The provider's retention and privacy terms are separate from this plugin.

## local/private

Supported source frontmatter includes `privacy: local`, `privacy: private`, `sensitivity: local` and `sensitivity: private`. Classify raw input before Markdown/Canvas/plugin-format conversion. Cloud indexing and cloud vocabulary omit non-normal sources and derivatives. Current-note/query context inherits the stricter source/draft privacy; no raw private context is interpreted by a cloud model.

This policy is prospective. Changing a previously ordinary note to private cannot recall content already sent to a provider. A loopback model service may independently forward traffic; endpoint validation does not audit that separate process.

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
