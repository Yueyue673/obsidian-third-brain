# Compatibility

## Supported formats and requirements

- **Desktop Obsidian 1.11.5+**, required for Obsidian's secret storage. Mobile is not supported.
- Markdown notes and text nodes in Canvas files. Compressed Excalidraw drawings are not indexed as text.
- AI modes use **OpenAI-compatible, non-streaming chat-completions APIs**. Streaming-only, tool-only and vendor-specific APIs are not supported by this transport.
- Source builds require **Node 22.12+** and npm. Release installation does not need Node. CI is configured for Node 22/24 on Windows and Ubuntu.

The Obsidian SDK package is pinned to 1.13.1; this is separate from the installed Obsidian app version.

## What still needs testing

This preview's native Obsidian click flow, real provider compatibility and broader AI quality remain unverified. The [testing record](VERIFICATION.md) separates version-specific native checks, downloaded packages, model checks and local tests.

Local excerpts use text and existing attributes, not semantic inference. Optional AI can misunderstand notes, choose poor associations or return nothing. A source quotation confirms where text came from, not that an explanation is correct. The plugin does not measure memory improvement or knowledge mastery.

## Storage and updates

These limits apply together:

| Item | Limit |
| --- | --- |
| Source records | 20,000 |
| Active fragments | 10,000 |
| Saved index | 32 MiB |
| One generated file | 2 MiB |
| Source text per update | 100 MiB |

A vault may reach a fragment or byte limit before the configured note-count limit. In that case, the update stops instead of saving a partial index.

Source and output symlinks are rejected. UTF-8 and BOM-marked UTF-16 are accepted; invalid text encoding is rejected. A daily/weekly schedule runs only while Obsidian is open.

Only the final index replacement is atomic. Generated Markdown files are updated individually, so an update may briefly show a mix of versions. Recovery does not cover every concurrent file edit or power-loss scenario. Details are in [Architecture](ARCHITECTURE.md).

Generated history is not encrypted and may survive source removal or enter vault sync and backups. See [Privacy](PRIVACY.md).

## 中文

- 需要桌面版 Obsidian 1.11.5 或更新版本，不支持移动端。
- 支持 Markdown 和 Canvas 文本，不把压缩的 Excalidraw 绘图当作笔记正文。
- 模型接口需要 OpenAI 兼容的非流式 chat-completions 格式；本版的真实服务商兼容性、Obsidian 点击流程和更大范围的 AI 效果仍在验证。
- 只有源码构建需要 Node 22.12+ 和 npm；安装发布包不需要。
- 片段数量、索引大小和单轮正文都有上限。超限时更新会停止，不会只保存一部分。
- 定时更新只在 Obsidian 打开时运行。生成文件逐个更新，过程中可能短暂混合新旧版本；恢复机制不能保证覆盖所有断电和并发修改情况。
- 历史摘录没有加密，也不保证在移除来源后全部清除。来源引用真实，不代表模型解释一定正确。
