# 第三大脑 · Third Brain

从一个想法找回自己笔记中的知识片段，在 Obsidian 里读关联理由、打开原文。

**[下载 0.2.0 预览版](https://github.com/Yueyue673/obsidian-third-brain/releases/download/0.2.0/third-brain-0.2.0.zip)** · [安装](#安装) · [English](README.md) · [隐私边界](docs/PRIVACY.md)

<img src="docs/images/native-obsidian-source-open-zh.png" alt="原生 Obsidian 中打开合成来源笔记，旁边显示第三大脑的本地摘录、关联理由和原文引用" width="680">

*原生 Obsidian，较早构建、合成笔记、本地摘录；不是公开包安装或真实 AI 演示。*

> **0.2.0 预览版 · 桌面 Obsidian 1.11.5+ · 尚未进入社区插件目录。**
> 默认本地摘录不需要密钥或网络，不是 AI 语义检索；真实 AI 服务兼容性与语义效果尚未验证。

## 安装

先用可丢弃的测试库。安装插件**不需要 Node.js**。

1. 从 [0.2.0 预览发布](https://github.com/Yueyue673/obsidian-third-brain/releases/tag/0.2.0)下载[插件 ZIP](https://github.com/Yueyue673/obsidian-third-brain/releases/download/0.2.0/third-brain-0.2.0.zip) 和 [SHA256SUMS](https://github.com/Yueyue673/obsidian-third-brain/releases/download/0.2.0/SHA256SUMS)，[核对 ZIP 的 SHA-256](docs/GETTING-STARTED.md#check-the-download) 后解压。
2. 在测试库内创建 `.obsidian/plugins/third-brain/`，把 **`main.js`、`manifest.json`、`styles.css`、`LICENSE`** 直接放进去，不要多套一层文件夹。
3. 重新加载 Obsidian，在**设置 → 第三方插件**中按提示允许第三方插件，并启用 **Third Brain**。点侧栏的脑形图标打开「第三大脑」，再点「更新笔记」。

第三方插件具有广泛访问权限；用于重要笔记库前，请先审阅代码并保留备份。遇到问题见[安装排障](docs/TROUBLESHOOTING.md)。

## 找到第一条关联

写下想法 →「寻找关联」→ 读关联理由 → 展开「来源证据」→「查看原文」。不必先找到某条旧笔记，也不必知道标签。

- **原稿与提炼层分开。** 生成的 Markdown 与索引默认放在 `Third Brain/Fragments`。原始笔记只读，已有手写文件和人工改过的生成文件受到保护。
- **先看理由，再决定用不用。** 卡片区分文字与属性匹配，附原文引用和类比边界。点属性可继续查找；低 / 中 / 高发散度只改变检索范围，不降低证据要求。
- **按你的节奏更新。** 默认手动，可选每日或每周，仅在 Obsidian 打开时运行。不自动插入原稿，不收集逐键输入、点击、停留或遥测。

想先试试？把明确标为虚构的[合成示例笔记](fixtures/sample-vault)复制进测试库，更新一次，搜索 `留白` 或 `Change one variable at a time`。空库和信息不足的笔记可以没有结果，不会为凑数量编造关联。详见[首次使用](docs/GETTING-STARTED.md#first-connection)。

## 顺着片段继续找

搜索结果中选择 **打开片段**，在笔记的 **Related fragments** 下继续打开相关片段，再查看各自的原文引用。生成笔记带有可读标题别名。关系来自已有主题、概念和机制属性，并限制在同一隐私等级；不把共同属性当作已验证的语义或因果关系。

## 本地摘录与模型模式

| 模式 | 做什么 | 需要什么 |
| --- | --- | --- |
| 本地摘录 · 默认 | 提取可读片段，按文字和已有属性检索；**不是 AI 语义理解** | 无账户、密钥或网络 |
| 本机模型 · 可选 | 通过配置的 OpenAI 兼容模型提炼片段、解释查询 | 自备回环模型服务与模型名称 |
| 云端模型 · 可选 | 普通笔记正文和查询可能发送到选定服务；local/private 来源及其词表不发送 | HTTPS 接口、宿主管理的密钥、明确同意 |

[模型配置](docs/GETTING-STARTED.md#optional-model-setup) · [隐私边界](docs/PRIVACY.md)

## 范围与限制

- 仅桌面端，处理可读 Markdown 和 Canvas 文本节点；不支持移动端。
- 来源变化后，旧证据会失效；缺失来源不会继续作为可打开的推荐。修改笔记后请更新。
- 引文证明出处，不证明每个解释正确；不保证普遍检索准确、改善记忆或判断掌握程度。
- 脱敏不能识别全部机密。启用云端**之前**，请把敏感笔记标为 local/private 或排除来源。生成历史不加密，删除来源也不保证抹除所有派生副本。
- 新版持久关联及旧库升级已用合成文件库实测；“打开片段”入口已接入原生面板，但 0.2.0 的宿主点击和真实 AI 质量尚未验收。[验证范围](docs/VERIFICATION.md)单独记录较早版本的原生检查。

[兼容与限制](docs/COMPATIBILITY.md) · [排障](docs/TROUBLESHOOTING.md)

## 开发

只有源码构建需要 Node **22.12+** 和 npm；Release 安装不需要。

```sh
git clone https://github.com/Yueyue673/obsidian-third-brain.git
cd obsidian-third-brain
npm ci --ignore-scripts
npm run build
```

将 **`dist/main.js`、`dist/manifest.json`、`dist/styles.css`、`dist/LICENSE`** 复制到上面的插件目录。[贡献指南](CONTRIBUTING.md)列出开发检查；`npm run demo` 是合成库浏览器测试工具，不是 Obsidian 窗口或真实 AI 演示。

[架构](docs/ARCHITECTURE.md) · [研究](docs/RESEARCH.md) · [安全反馈](SECURITY.md) · [更新记录](CHANGELOG.md)

## 许可

[MIT](LICENSE)，独立实现，不复制私人笔记库或竞品代码。Obsidian 是独立产品，依赖许可见[第三方声明](THIRD-PARTY-NOTICES.md)。
