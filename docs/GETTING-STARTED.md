# Getting started

[English README](../README.md) · [中文上手](#中文上手)

Third Brain 0.3.7 requires desktop Obsidian 1.11.5+. It is a demo, not yet listed in Community plugins. Start in a test vault and keep a backup before using important notes. Installation does not require Node.js.

## Install the preview

1. Download [third-brain-0.3.7.zip](https://github.com/Yueyue673/obsidian-third-brain/releases/download/0.3.7/third-brain-0.3.7.zip) and [SHA256SUMS](https://github.com/Yueyue673/obsidian-third-brain/releases/download/0.3.7/SHA256SUMS). [Check the download](#check-the-download), then extract the ZIP. The Source code archives are for developers.
2. Put the four extracted files directly in this folder inside your vault:

   ```text
   .obsidian/plugins/third-brain/
   ├── main.js
   ├── manifest.json
   ├── styles.css
   └── LICENSE
   ```

3. Restart Obsidian. In **Settings → Community plugins**, allow community plugins if prompted and enable **Third Brain**. Click the brain icon in the ribbon to open it.

If it is not listed, check that `manifest.json` is in the exact folder above, without another nested directory. You can also install the four loose files from the [release](https://github.com/Yueyue673/obsidian-third-brain/releases/tag/0.3.7). [Troubleshooting](TROUBLESHOOTING.md).

### Check the download

Run the command for your system in the download folder. Compare the result with the ZIP entry in `SHA256SUMS`. Do not install a file with a different hash.

Windows — PowerShell:

```powershell
Get-FileHash .\third-brain-0.3.7.zip -Algorithm SHA256
```

macOS:

```sh
shasum -a 256 third-brain-0.3.7.zip
```

Linux:

```sh
sha256sum third-brain-0.3.7.zip
```

## First connection

1. Add a few notes to the test vault, or copy the [sample notes](../fixtures/sample-vault). Leave the mode set to **Local excerpts** and click **Refresh notes**.
2. Type an idea and click **Find connections**. With the sample notes, try `留白` or `Change one variable at a time`.
3. Expand **Source evidence**, read the quotation and click **Open original**.

Local mode matches words and existing attributes; it does not infer meaning. An empty vault or unrelated search can return nothing. Refresh again after editing notes.

**Use current note** searches with your selection or current draft once. For long notes, select a shorter passage. It does not monitor typing or insert text into your note.

## Explore the results

Click a topic, concept, mechanism or type on a result card to find more material with that attribute. This does not make another model request. Editing the search text returns to ordinary search.

**Low** focuses on direct matches; **Medium** includes mechanisms; **High** can include cross-domain and indirect suggestions. A mechanism needs Medium or High; atmosphere needs High. The panel explains when a selection needs a wider range.

High can show up to two indirect suggestions separately from the main results. Expand **Compare both original sources** to read both quotations. A shared mechanism is a reason to compare the notes, not proof of equivalence or causation.

Use **Open fragment** to read a generated note and follow its **Related fragments** links. All searches show a limited number of results; type matching is not a complete inventory of that type.

## Optional model setup

Open **Settings → Third Brain**. AI modes use OpenAI-compatible, non-streaming chat-completions APIs. Other API formats and real provider compatibility are not yet verified. You can always stay in local-excerpt mode.

### Local model

1. Start your own OpenAI-compatible model service. The plugin does not install or start one.
2. Select **Local model**. Enter its loopback `/v1` base URL and exact model name. Select an API key from Obsidian's secret storage if the service requires one.
3. Refresh notes, then search.

The default URL is an example, not a running model. A separate local service may forward requests elsewhere; check how yours works.

### Cloud model

1. Read the [privacy notes](PRIVACY.md). Mark sensitive notes local/private or exclude their folders before indexing.
2. Select **Cloud model**. Enter an HTTPS `/v1` base URL, the model name and a secret stored by Obsidian.
3. Enable **Allow cloud processing**, then refresh. Ordinary note text and submitted searches may be sent to that provider.

To keep a note out of cloud requests, add this to its properties:

```yaml
---
privacy: local
---
```

`privacy: private`, `sensitivity: local` and `sensitivity: private` also work. Marking a note private later cannot recall text already sent. Automatic redaction does not catch every secret.

## Updates and generated files

Refresh is manual by default. Daily and weekly schedules run only while Obsidian is open; reopening it catches up an overdue refresh once. Use **Cancel** to stop a running task.

**Unreleased source builds:** cancelling a note refresh also pauses automatic updates for the current plugin session. With a daily/weekly schedule, the panel keeps a pause reminder visible after searching or reopening it. A successful manual **Refresh notes**, or reloading the plugin, resumes them. Searches and settings saves do not undo this pause; cancelling a search does not pause maintenance. These changes are not included in the 0.3.7 download.

Generated Markdown, the index and history are stored under `Third Brain/Fragments` by default. Original notes, user-written files and manually edited generated files are protected from overwriting. Disabling the plugin stops processing; it does not erase generated history. These files are not encrypted and may enter vault sync or backups.

If a refresh fails, the panel reports the affected note and stage. Fix the reported problem or exclude that source, then try again. A failure before saving retains any previous complete index, but stale references remain unavailable. If saving itself fails, keep the generated folder intact and see [Troubleshooting](TROUBLESHOOTING.md).

## Build from source

For development, install Node **22.12+** and npm:

```sh
git clone https://github.com/Yueyue673/obsidian-third-brain.git
cd obsidian-third-brain
npm ci --ignore-scripts
npm run build
```

Copy `dist/main.js`, `dist/manifest.json`, `dist/styles.css` and `dist/LICENSE` to the plugin folder above. A main-branch build may differ from the released ZIP. See [Contributing](../CONTRIBUTING.md) for checks.

## Testing status

This demo's native Obsidian click flow, real provider compatibility and broader AI quality are still being tested. The sample notes include declared labels; finding their shared mechanism is not proof of automatic AI discovery. The screenshots show an earlier build with sample notes in local mode. Version-specific checks are listed in [Testing status](VERIFICATION.md).

---

## 中文上手

需要桌面版 Obsidian 1.11.5 或更新版本。目前是 0.3.7 Demo，尚未上架社区插件目录。建议先用测试库；用于重要笔记前请备份。安装发布包不需要 Node.js。

### 安装

1. 下载 [third-brain-0.3.7.zip](https://github.com/Yueyue673/obsidian-third-brain/releases/download/0.3.7/third-brain-0.3.7.zip) 和 [SHA256SUMS](https://github.com/Yueyue673/obsidian-third-brain/releases/download/0.3.7/SHA256SUMS)。核对校验值后解压，别选 Source code 源码包。
2. 在库内创建 `.obsidian/plugins/third-brain/`，直接放入 `main.js`、`manifest.json`、`styles.css`、`LICENSE` 四个文件，不要多套一层文件夹。
3. 重启 Obsidian，在「设置 → 第三方插件」中按提示允许第三方插件，再启用 **Third Brain**。点左侧脑形图标打开面板。

插件没出现时，先检查 `manifest.json` 的位置，再重启。[常见问题](TROUBLESHOOTING.md#中文)。

Windows 用户可在下载目录打开 PowerShell，运行：

```powershell
Get-FileHash .\third-brain-0.3.7.zip -Algorithm SHA256
```

把结果与 `SHA256SUMS` 中 ZIP 对应的校验值比较，不一致就不要安装。macOS 和 Linux 命令见[下载校验](#check-the-download)。

### 第一次使用

1. 加入几篇笔记，或复制[示例笔记](../fixtures/sample-vault)，保持「本地摘录」模式，点「更新笔记」。
2. 输入想法，点「寻找关联」。示例库可以试 `留白` 或 `Change one variable at a time`。
3. 展开「来源证据」，阅读引用，点「查看原文」。

本地模式按文字和已有属性匹配，不推断语义。空库、信息不足或无关搜索可以没有结果。原笔记改动后，请再点一次「更新笔记」。

「使用当前笔记」会读取一次选区或当前草稿，用它来搜索。长笔记可以先选一段，不会持续监控输入，也不会自动写入原笔记。

### 继续查找

点卡片上的主题、概念、机制或类型，可查找具有相同属性的片段，不会再调用模型。这里的“机制”指共同的做法或原理。编辑输入后会回到普通搜索；切换发散度会保留属性选择。

低发散侧重直接匹配，中发散可看相同机制，高发散可看跨领域和间接建议。机制需要中或高，氛围需要高；范围不够时面板会提示。

高发散下，主结果之外最多显示两条间接建议。展开「分别核对两端原文」查看两篇笔记，再判断关联是否有用。也可以点「打开片段」，沿 **Related fragments** 中的链接继续阅读。结果有数量限制，按类型查找也不代表列出该类型的全部内容。

### 配置模型

打开「设置 → Third Brain」。目前使用 OpenAI 兼容、非流式 chat-completions 接口；其他 API 格式和真实服务商兼容性仍需测试。可以始终只用本地摘录。

- **本机模型：**自行启动模型服务，选择「本机模型」，填入回环 `/v1` 基础地址和模型名。有认证要求时，选择 Obsidian 保存的密钥。默认地址只是示例，插件不会替你安装模型；本机服务是否转发请求，需要自行确认。
- **云端模型：**先阅读[隐私说明](PRIVACY.md#中文)，把敏感笔记标为 local/private 或排除文件夹。选择「云端模型」，填写 HTTPS `/v1` 基础地址、模型名和 Obsidian 保存的密钥，再开启「允许云端处理」。普通笔记正文和搜索输入可能发送给该服务商。

笔记属性可以这样写，阻止它进入云端请求：

```yaml
---
privacy: local
---
```

也支持 `privacy: private`、`sensitivity: local` 和 `sensitivity: private`。之后再标私密不能撤回已经发送的内容，自动脱敏也不能识别所有隐私。

### 更新与文件

默认手动更新。每日、每周更新只在 Obsidian 打开时运行，重新打开后会补一次到期任务。运行中可点「取消」。

**尚未发布的源码版本：**取消笔记更新后，本次插件运行期间的自动更新也会暂停。使用每日或每周更新时，继续搜索或重开面板，仍能看到暂停提示。手动「更新笔记」成功，或重新加载插件后恢复。搜索和保存设置不会解除暂停；取消搜索不影响自动更新。0.3.7 下载包尚不包含这些改动。

生成片段、索引和历史默认保存在 `Third Brain/Fragments`。插件不覆盖原笔记、手写文件或人工改过的生成文件。停用插件会停止处理，但不会清空生成历史；这些文件没有加密，也可能进入同步和备份。

更新失败时，查看面板提示的笔记和原因，处理问题或明确排除该来源后重试。保存前失败会保留已有完整索引，但来源已变的旧引用仍不能使用。保存过程中出错时，请保留生成目录，参见[常见问题](TROUBLESHOOTING.md#中文)。

### 开发与测试状态

只有源码构建需要 Node **22.12+** 和 npm，命令见[源码构建](#build-from-source)。

本 Demo 的 Obsidian 完整点击流程、真实服务商接口和更大范围的 AI 效果仍在验证。示例笔记已有声明标签，找到共同机制不代表 AI 能自动发现同类联系。截图使用较早版本、示例笔记和本地模式。[测试记录](VERIFICATION.md)按版本列出了已完成与未完成的检查。
