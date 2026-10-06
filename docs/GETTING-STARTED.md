# Getting started / 上手

[English README](../README.md) · [中文 README](../README.zh-CN.md) · [Install](#install-the-preview) · [Models](#optional-model-setup) · [Build from source](#build-from-source)

**0.2.0 is a prerelease for desktop Obsidian 1.11.5+.** It is not in the Community directory. Default local excerpts work without an account, key or network; they are not AI semantic search. Live AI-provider compatibility and semantic quality remain unverified.

**0.2.0 是桌面预览版，需要 Obsidian 1.11.5+，尚未进入社区插件目录。** 默认本地摘录无需账户、密钥或网络，不是 AI 语义检索；真实 AI 服务兼容性与语义效果尚未验证。

## Install the preview

Use a disposable test vault first. You do **not** need Node.js for release installation. Community plugins have broad access; keep a backup before using an important vault.

先用可丢弃的测试库，Release 安装**不需要 Node.js**。第三方插件具有广泛访问权限；用于重要笔记库前请保留备份。

1. Download [third-brain-0.2.0.zip](https://github.com/Yueyue673/obsidian-third-brain/releases/download/0.2.0/third-brain-0.2.0.zip) and [SHA256SUMS](https://github.com/Yueyue673/obsidian-third-brain/releases/download/0.2.0/SHA256SUMS) from the [0.2.0 prerelease](https://github.com/Yueyue673/obsidian-third-brain/releases/tag/0.2.0). [Check the ZIP's hash](#check-the-download), then extract it. Use this plugin ZIP, **not** GitHub's “Source code” archive.
   下载插件 ZIP 与校验文件，核对后解压；不要下载 GitHub 自动生成的「Source code」源码包来安装。
2. Create `.obsidian/plugins/third-brain/` inside your test vault and put all four extracted files directly inside:
   在测试库内创建插件目录，把四个文件直接放入，不要多套一层文件夹：

   ```text
   .obsidian/plugins/third-brain/
   ├── main.js
   ├── manifest.json
   ├── styles.css
   └── LICENSE
   ```

3. Reload Obsidian, review the host's trust prompt, allow Community plugins if prompted, and enable **Third Brain** in **Settings → Community plugins**. Click the brain ribbon icon or run the plugin's **Find connections** command to open the panel. Select **Refresh notes** once.
   重新加载 Obsidian，阅读宿主的信任提示，在**设置 → 第三方插件**中按提示允许第三方插件，并启用 **Third Brain**。点脑形图标或插件的「寻找关联」命令，打开面板后点一次「更新笔记」。

If the plugin is missing, check the exact folder and `manifest.json` placement, then restart Obsidian. The four files are also available as individual release assets. [Troubleshooting](TROUBLESHOOTING.md).

如果插件不出现，先检查目录和 `manifest.json` 是否多套了一层，再重启 Obsidian。也可下载四个独立资产安装。详见[排障](TROUBLESHOOTING.md)。

### Check the download

Run one command in the folder containing your downloaded ZIP. Compare its hash with the line for `third-brain-0.2.0.zip` in `SHA256SUMS`; if they differ, do not install it.

在下载目录运行适合你系统的一条命令，与 `SHA256SUMS` 中 ZIP 对应行的哈希比较；不一致就不要安装。

**Windows — PowerShell**

```powershell
Get-FileHash .\third-brain-0.2.0.zip -Algorithm SHA256
```

**macOS**

```sh
shasum -a 256 third-brain-0.2.0.zip
```

**Linux**

```sh
sha256sum third-brain-0.2.0.zip
```

## First connection

**English**

1. Add a few notes to your test vault, or copy the authored synthetic [sample notes](../fixtures/sample-vault) into it. Keep **Local excerpts** selected and choose **Refresh notes**; progress and **Cancel** are shown in the panel.
2. Type an idea and select **Find connections**. With the sample notes, try `留白` or `Change one variable at a time`. You do not need to name a tag first.
3. Read the retrieval explanation, expand **Source evidence**, inspect the quotation and select **Open original**. Click a facet to explore related fragments. Low/medium/high breadth changes candidate scope, not evidence or privacy rules.

**中文**

1. 在测试库加入几篇笔记，或复制明确标为虚构的[合成示例笔记](../fixtures/sample-vault)。保持「本地摘录」模式，点「更新笔记」；面板会显示进度和「取消」。
2. 写下想法，点「寻找关联」。示例库可试 `留白` 或 `Change one variable at a time`，不必先知道标签。
3. 读理由，展开「来源证据」，核对引用后点「查看原文」。点属性可继续查找；低 / 中 / 高只改变候选范围，不降低证据与隐私要求。

See the [idea-entry screenshot](images/native-obsidian-activation-zh.png) and [opened-source screenshot](images/native-obsidian-source-open-zh.png). Both show an earlier build in native Obsidian with synthetic notes and local excerpts, not the public package or a live AI model.

可查看[输入想法](images/native-obsidian-activation-zh.png)与[打开原文](images/native-obsidian-source-open-zh.png)截图：均为较早构建在原生 Obsidian 中运行合成笔记与本地摘录，不代表公开包安装或真实 AI 效果。

An empty vault cannot provide personal knowledge, and sparse notes can produce no fragments. No result is invented to fill the list. These sample queries are controlled examples, not universal retrieval guarantees. Refresh again after changing source notes.

空库不能凭空提供个人知识，信息不足可以不提炼、不返回结果。示例查询不是普遍准确率保证；来源笔记改动后请再次更新。

## Optional model setup

You can stay in local-excerpt mode. To try a model, open **Settings → Third Brain**. This release uses OpenAI-compatible, non-streaming chat-completions endpoints; vendor-specific APIs and live-provider quality are not claimed supported or verified. See [compatibility](COMPATIBILITY.md).

可以一直使用本地摘录。尝试模型时，打开**设置 → Third Brain**。此版本对接 OpenAI 兼容、非流式 chat-completions 接口，不宣称支持厂商专有 API 或已经验证真实模型效果，详见[兼容范围](COMPATIBILITY.md)。

### Local model

**English**

1. Start your own OpenAI-compatible local service; Third Brain does not install or run a model for you.
2. Choose **Local model**, set its loopback `/v1` base endpoint and exact model name. If needed, choose a host-managed secret in **API key**.
3. Refresh notes, then search. Malformed or unsupported output fails closed; a failed refresh retains the previous complete index.

**中文**

1. 自行启动 OpenAI 兼容本机服务；插件不会安装或启动模型。
2. 选择「本机模型」，填写回环 `/v1` 基础地址和确切模型名；需要认证时，在「API 密钥」中选择宿主管理的密钥。
3. 更新后再查询。格式错误或不受支持的输出会被拒绝，更新失败保留上一完整索引。

The default endpoint is only an example, not an installed service. A loopback destination does not prove that a separate local process never forwards requests elsewhere.

默认地址只是示例，不代表已经安装模型。回环地址也不能保证另一个本机服务不会自行转发请求。

### Cloud model

**English**

1. Review [privacy boundaries](PRIVACY.md) and the provider's terms **before** sending notes. Mark sensitive notes local/private or exclude their folders first.
2. Choose **Cloud model**, set an HTTPS `/v1` endpoint and model, then select a host-managed secret. Only the secret identifier is stored in plugin settings.
3. Explicitly enable **Allow cloud processing**, then refresh. Ordinary note text and explicitly submitted queries may reach that provider; local/private sources and their vocabulary are excluded.

**中文**

1. 外发前阅读[隐私边界](PRIVACY.md)与服务商条款，先把敏感笔记标为 local/private 或排除其文件夹。
2. 选择「云端模型」，填写 HTTPS `/v1` 接口和模型，在宿主密钥组件中选择密钥；插件设置只保存密钥标识。
3. 明确打开「允许云端处理」，再更新。普通笔记正文与明确提交的查询可能发送到该服务，local/private 来源及其词表不发送。

Use source frontmatter such as / 可在来源笔记中设置：

```yaml
---
privacy: local
---
```

`privacy: private`, `sensitivity: local` and `sensitivity: private` are also supported. Applying the policy needs no external request. It is prospective: later marking a note private cannot recall text already received by a provider. URL credentials, query strings, fragments and redirects are rejected; pattern-based redaction cannot detect every secret. A verified quotation proves its source, not the model's interpretation.

也支持上述 private 与 sensitivity 标记，应用策略无需外部请求。保护不追溯：之后标私密不能撤回此前外发的正文。接口地址不允许内嵌凭据、查询串、片段或重定向；规则脱敏不能识别全部机密，引文存在也不能证明模型理解正确。

## Current note and scheduling

**Use current note** reads your selection or the current draft once, retaining the stricter source/draft privacy. Select a shorter passage for long notes. It does not watch a keystroke stream or modify the editor.

「使用当前笔记」只读取一次选区或当前草稿，继承原稿 / 草稿中更严格的隐私设置。长笔记请选较短段落；不持续采集逐键输入，也不修改编辑器。

Refresh is manual by default. Optional daily/weekly maintenance runs only while Obsidian is open; an overdue refresh is caught up once. No task runs after Obsidian closes, and no OS monitor is installed.

默认手动更新，可选每日 / 每周；仅在 Obsidian 打开时运行，重新打开后补一次到期更新，不安装系统后台监控。

## Generated files and removal

The default generated folder is `Third Brain/Fragments`, with owned Markdown and reserved hidden state/history. A folder name does not establish ownership; user-authored files and manually edited generated files are protected. Originals are never deleted or rewritten.

默认提炼层为 `Third Brain/Fragments`，包含生成 Markdown 与保留的隐藏状态 / 历史。文件夹名不等于所有权；手写文件与人工改过的生成文件受到保护，原稿不删除、不重写。

To stop processing, disable the plugin. Hidden history may retain retired excerpts and can enter vault backups/sync. It is not encrypted, and this release does **not** guarantee immediate erasure of all derived copies when a source is removed. Review backup/sync policy if you require erasure.

停用插件即可停止处理。隐藏历史可能保留旧摘录并进入备份 / 同步；隐藏不等于加密，删除来源也不保证立即抹除全部派生副本。有清除需求时请同时检查备份和同步策略。

## Build from source

For development only: Node **22.12+** and npm. Release users can skip this section.

仅源码开发需要 Node **22.12+** 和 npm，安装 Release 可跳过。

```sh
git clone https://github.com/Yueyue673/obsidian-third-brain.git
cd obsidian-third-brain
npm ci --ignore-scripts
npm run build
```

Copy **`dist/main.js`, `dist/manifest.json`, `dist/styles.css` and `dist/LICENSE`** directly into the plugin folder from [installation step 2](#install-the-preview), then reload and enable as above. A default-branch source build may differ from the published prerelease. [Contributing](../CONTRIBUTING.md) covers development checks.

把 **`dist/main.js`、`dist/manifest.json`、`dist/styles.css`、`dist/LICENSE`** 直接复制到安装步骤中的插件目录，再重新加载并启用。默认分支源码构建可能与已发布预览版不同，开发检查见[贡献指南](../CONTRIBUTING.md)。

## Preview evidence

The public assets were downloaded, hash-checked and loaded in native Obsidian. The full refresh/search/open click journey on that exact public package has not been rerun. Earlier native-build checks and live AI checks are separate; see [verification scope](VERIFICATION.md).

公开资产已下载、校验并在原生 Obsidian 中加载；该公开包的完整更新 / 查询 / 打开原文点击旅程尚未重跑。较早原生构建与真实 AI 验证是不同证据，见[验证范围](VERIFICATION.md)。
## Follow stored fragment links

After searching, choose **Open fragment / 打开片段** on a result. Follow the **Related fragments** Markdown links, then compare the **Original evidence** sections on both notes. Targets are persisted, same-privacy generated files; shared facets explain the suggestion, not an established causal relationship. Native-host clicks on this preview remain unverified.
