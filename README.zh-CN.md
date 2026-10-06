# 第三大脑 · Third Brain

一个 Obsidian 插件，把笔记整理成可检索的片段。写下一个想法，查看相关内容、关联理由和原文出处。

[下载 0.3.7](https://github.com/Yueyue673/obsidian-third-brain/releases/tag/0.3.7) · [使用说明](docs/GETTING-STARTED.md#中文上手) · [English](README.md)

<img src="docs/images/native-obsidian-source-open-zh.png" alt="Obsidian 中打开原笔记，右侧显示搜索结果与原文引用" width="680">

*截图来自较早版本，使用示例笔记和本地摘录模式。*

## 安装

需要**桌面版 Obsidian 1.11.5 或更新版本**。目前是预览版，尚未上架社区插件目录，建议先在测试库里试用。

1. 下载 [third-brain-0.3.7.zip](https://github.com/Yueyue673/obsidian-third-brain/releases/download/0.3.7/third-brain-0.3.7.zip) 并解压。选插件 ZIP，不要选 Source code 源码包。
2. 在笔记库里创建 `.obsidian/plugins/third-brain/`，把 `main.js`、`manifest.json`、`styles.css`、`LICENSE` 直接放进去，不要多套一层文件夹。
3. 重启 Obsidian，在「设置 → 第三方插件」中启用 **Third Brain**，再点左侧脑形图标打开面板。

使用本地模式不需要 Node.js、账户或 API 密钥。[下载校验和安装排障](docs/GETTING-STARTED.md#中文上手)。

## 使用

1. 点「更新笔记」，建立索引。
2. 输入想法，点「寻找关联」。也可以点「使用当前笔记」，用选中的文字或当前草稿搜索。
3. 查看结果和关联理由，展开「来源证据」，点「查看原文」。

想先试试，可以把[示例笔记](fixtures/sample-vault)复制进测试库，更新后搜索 `留白` 或 `Change one variable at a time`。

## 功能

- 处理 Markdown 和 Canvas 文本。生成片段默认保存在 `Third Brain/Fragments`，不修改原笔记。
- 每条结果附匹配理由和原文引用。来源变了或找不到了，旧结果就不能继续当作有效引用。
- 点卡片上的主题、概念、机制或类型，继续查找。这里的“机制”指共同的做法或原理。点「打开片段」还能沿着保存的链接查看相关片段。
- 用低、中、高调整关联范围。高发散下可另外显示间接建议，并提供两篇笔记的原文供比较；这些建议可能不合适，需要自行判断。
- 支持手动、每日、每周更新。定时更新只在 Obsidian 打开时运行，未改动的笔记会复用之前的结果。

## 搜索模式

| 模式 | 怎么搜索 | 需要配置 |
| --- | --- | --- |
| 本地摘录 · 默认 | 摘取段落，按文字和已有笔记属性匹配，不推断语义。 | 无需配置，离线使用。 |
| 本机模型 | 用模型提炼片段、理解搜索输入。 | 自备 OpenAI 兼容的本机模型服务。 |
| 云端模型 | 把允许发送的笔记正文和搜索输入交给指定服务商。 | HTTPS 接口、模型名、API 密钥，并开启云端处理。 |

[模型配置说明](docs/GETTING-STARTED.md#配置模型)。

## 数据与隐私

云端处理默认关闭。标为 `privacy: local` 或 `privacy: private` 的笔记及其生成标签不发送到云端。插件不收集点击、停留或输入历史。

生成文件和历史记录没有加密，也可能进入笔记库的同步和备份。移除原笔记不保证清除所有旧摘录。启用云端前请阅读[隐私说明](docs/PRIVACY.md#中文)。

## 当前状态

仅支持桌面端。默认本地搜索不需要模型；AI 模式取决于所用服务，可能找不到内容或给出不合适的关联。本版在 Obsidian 中的完整点击流程、真实服务商接口和更大范围的 AI 效果仍在验证，详见[测试记录](docs/VERIFICATION.md)。

## 开发

源码构建需要 Node **22.12+** 和 npm。直接安装发布包不需要。

```sh
git clone https://github.com/Yueyue673/obsidian-third-brain.git
cd obsidian-third-brain
npm ci --ignore-scripts
npm run build
```

把 `dist/main.js`、`dist/manifest.json`、`dist/styles.css`、`dist/LICENSE` 复制到插件目录即可。开发检查见[贡献指南](CONTRIBUTING.md)。`npm run demo` 是使用示例笔记的浏览器测试页面，不是 Obsidian 或真实模型演示。

[架构](docs/ARCHITECTURE.md) · [兼容性](docs/COMPATIBILITY.md) · [常见问题](docs/TROUBLESHOOTING.md) · [更新记录](CHANGELOG.md) · [安全反馈](SECURITY.md)

## 许可

[MIT](LICENSE)。依赖许可见[第三方声明](THIRD-PARTY-NOTICES.md)。
