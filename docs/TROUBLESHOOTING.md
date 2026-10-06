# Troubleshooting

[Getting started](GETTING-STARTED.md) · [中文](#中文)

## The plugin does not appear

Check that `main.js`, `manifest.json`, `styles.css` and `LICENSE` are directly inside `.obsidian/plugins/third-brain/`. Restart Obsidian and enable Third Brain in Settings → Community plugins. This preview requires desktop Obsidian 1.11.5+.

## No search results

Run **Refresh notes** once. Check that the vault has readable notes and that your exclusions do not cover them. You can try the [sample notes](../fixtures/sample-vault) in a test vault.

Local excerpts match words and existing attributes, not arbitrary meaning. A wider association range cannot create useful material from unrelated notes. Empty or sparse notes may produce no fragments.

## A model request fails

Check the processing mode, base URL, model name and selected API key. Cloud mode also needs HTTPS and **Allow cloud processing** enabled. This preview expects an OpenAI-compatible, non-streaming chat-completions API.

Timeouts, redirects, oversized responses and invalid output stop the request. The plugin does not print the provider's raw reply or silently switch modes. You can select **Local excerpts** yourself to use the offline search.

## Refresh fails or is cancelled

For a source failure, the panel shows the affected note, stage and last progress. Fix the reported format or access problem, or explicitly exclude the note, then refresh again. The plugin does not rewrite the original to fix it.

Source builds also explain known missing or changed generated files at refresh or startup, without first opening a fragment. The refresh command uses the same guidance; scheduled failures stay in the panel without repeated popups. Follow the protected-file guidance below instead of repeatedly refreshing. Unknown I/O or corrupt metadata is not classified as a missing-file problem. This improvement is not yet in the 0.3.7 download.

A failure before saving retains any previous complete index, but changed or unreadable source references are still unavailable. On a first failed update, there is no complete index yet. If saving itself fails, or a generated file was edited by hand, keep the folder intact; do not assume that the disk index is safe to reuse.

Cancel stops further processing, but an operating-system read already in progress may take time to finish.

## An old source link will not open

The source may have changed, disappeared or been excluded. Refresh the notes before using the old result. If a fragment quotes several notes, all of them must still match; keeping one unchanged source is not enough.

## A generated file is protected

A folder name does not make every file inside it plugin-owned. User-written files and manually edited generated files are not overwritten. Keep the affected files and inspect the conflict in a test copy. Do not clear the index to force an overwrite.

The complete generated layer is checked before opening a fragment, so a missing or changed file elsewhere in that layer can also block the click. For a missing file, keep the folder and hidden metadata; try restoring the matching generated version from a backup in a test copy, then reopen the plugin. Repeated refreshes do not bypass this protection. An unavailable old result or host file-list entry can instead require a new search; unknown read errors still need diagnosis and are not treated as proof of a missing file.

## The index cannot be loaded

Keep the generated folder, including its hidden files, for diagnosis in a copy. An invalid or unsupported index is not treated as an empty vault. Do not upload the folder publicly: it can contain note excerpts.

## Scheduled updates do not run

Obsidian must be open and the schedule set to Daily or Weekly. Manual is the default. Reopening Obsidian catches up a due update once.

## The current note is too long

Select a shorter passage before clicking **Use current note**. The plugin reads it once; it does not watch your editor continuously.

## Reporting a bug

Include the plugin version, Obsidian version, processing mode, steps and a small sample note. Do not attach private notes, generated history, API keys or raw model replies. Security issues are covered in [SECURITY.md](../SECURITY.md).

---

## 中文

### 插件没有出现

确认四个文件直接放在 `.obsidian/plugins/third-brain/`，没有多套一层目录。重启 Obsidian，在「设置 → 第三方插件」中启用 Third Brain。需要桌面版 Obsidian 1.11.5 或更新版本。

### 找不到结果

先点一次「更新笔记」，确认库里有可读笔记，且没有被排除。可以用[示例笔记](../fixtures/sample-vault)在测试库里试。

本地摘录按文字和已有属性匹配，不推断语义；提高发散度也不会凭空产生相关资料。空白或信息太少的笔记可以没有片段。

### 模型请求失败

检查模式、接口地址、模型名和所选 API 密钥。云端模式还需要 HTTPS 和「允许云端处理」。目前对接 OpenAI 兼容、非流式 chat-completions 接口。

超时、重定向、过大回复或格式错误会中止请求，不会显示服务商原始回包，也不会偷偷换模式。需要离线使用时，可以手动选择「本地摘录」。

### 更新失败或取消

若是来源故障，查看面板提示的笔记、阶段和最后进度，处理文件格式或访问问题，也可以明确排除该来源后重试。插件不会替你修改原笔记。

从源码构建的版本还会在更新或启动时直接说明已确认的生成文件缺失、改动，不必先打开片段。更新命令显示相同指引，定时更新失败只留在面板、不重复弹窗。请按下方受保护文件的指引处理，不要反复更新。未知读取异常或元数据损坏不会被当作文件缺失；这项改进尚未包含在 0.3.7 下载包中。

保存前失败会保留已有完整索引，但过时或不可读的来源仍不能使用。第一次更新失败时，还没有可用索引。保存过程中出错或遇到人工修改的生成文件时，请保留目录，不要直接当作旧索引仍可用。

取消后会停止后续处理，但已经开始的系统读取可能需要一点时间才结束。

### 旧引用打不开

原笔记可能已修改、移除或被排除，请先更新。一个片段引用了多篇笔记时，全部来源都要仍然有效，不能靠剩下的一篇继续使用旧结果。

### 提示生成文件受保护

手写文件和人工改过的生成文件不会被覆盖。保留文件，在测试副本里查看冲突；不要清空索引来强行覆盖。

打开片段前会核验整个提炼层，因此同层其他生成文件的缺失或改动也可能阻止打开。文件缺失时，请保留目录和隐藏元数据，先在测试副本中用备份恢复对应生成版本，再重新打开插件；反复更新不会绕过保护。旧结果或宿主文件列表里的项目不再可用时，可重新搜索。未知读取异常仍需排查，不能据此认定文件缺失。

### 索引无法加载

保留生成目录和隐藏文件，在副本中排查。无效索引不会被当作空库处理。这些文件可能包含原文摘录，不要上传到公开 Issue。

### 定时更新没有运行

确认 Obsidian 正在运行，且计划设为每日或每周。默认是手动更新。重新打开 Obsidian 后会补一次到期更新。

### 当前笔记太长

先选中较短的一段，再点「使用当前笔记」。插件只读取一次，不持续监控编辑器。

### 提交问题

提供插件版本、Obsidian 版本、处理模式、操作步骤和一份示例笔记。不要提交私密笔记、生成历史、密钥或原始模型回复。安全问题见[SECURITY.md](../SECURITY.md)。
