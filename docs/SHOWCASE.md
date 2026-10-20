# About the examples / 案例说明

[English README](../README.md) · [中文 README](../README.zh-CN.md)

## What the images show

The README examples use the existing, authored [sample notes](../fixtures/sample-vault). They are not someone's private notebook. The note properties already include topics, concepts and mechanisms; the examples do not demonstrate live AI extraction or automatic discovery.

The showcase screenshots use the **0.3.7** UI renderer in the project's browser test page, connected to the real file-source adapter, controller and generated-file store. They are **not native Obsidian screenshots**. In this test page, **Open original** opens a source-text dialog; in Obsidian, it opens the actual note. No native host acceptance is implied.

The cover is an original workflow illustration, not a proposed interface. Its notes → excerpts → original sequence describes existing actions. It does not depict a new graph or a redesigned plugin.

## Reproduce the examples

Install the [0.3.7 demo](https://github.com/Yueyue673/obsidian-third-brain/releases/tag/0.3.7) in a disposable vault, copy the sample notes into it, keep **Local excerpts** selected and click **Refresh notes**.

### Search for a passage

Search for `留白` at **Medium** breadth. The sample dialogue and music notes have both text and declared attributes matching this term. Expand **Source evidence** to compare quotations, then use **Open original**.

Source material:

- [Dialogue / 对话留下的空隙](../fixtures/sample-vault/创作/对话留下的空隙.md): a question about returning for dinner implies more when a suitcase is already visible. The following paragraph warns that removing every clue can make a scene incomprehensible.
- [Music / 音乐中的停顿](../fixtures/sample-vault/创作/音乐中的停顿.md): a pause can create anticipation after a melody has established an expectation; random silence need not do so.

The Chinese source text stays Chinese even when the controls are in English. The plugin has not translated it.

### Follow a shared mechanism

On a result card, click `不完整信息促使主动补全` at **Medium** breadth. Both sample notes declare this mechanism, so both can be retrieved. Here, mechanism means a shared process or principle.

This verifies filtering by an existing property, not semantic equivalence, causal reasoning, live AI interpretation or usefulness for every writing task.

## Screenshot and artwork notes

| Asset | Content |
| --- | --- |
| `images/readme-cover*.svg` | Original light/dark workflow artwork, English and Chinese. |
| `images/showcase-search-en.png`, `images/showcase-search-zh.png` | Actual search and source-open screenshots, arranged side by side. The source-open view is the browser test adapter's dialog. |
| `images/showcase-connection-en.png`, `images/showcase-connection-zh.png` | Actual result-card mechanism selection and matching results, cropped for readability. |
| Existing `images/native-obsidian-*.png` | Older native screenshots, retained; not presented as current-version acceptance. |

Screenshot framing may crop surrounding empty space, add step labels and place two actual captures together. Product controls, result text and source text are not replaced. Source text is taken from the same sample note throughout the comparison.

To inspect the browser test page from source, follow [Build from source](GETTING-STARTED.md#build-from-source), then run `npm run demo`. The current `main` branch can look different from 0.3.7. To reproduce that version's UI, use a separate checkout of tag `0.3.7`; do not reset an active working tree.

## 中文

README 使用的是仓库自带的演示笔记，没有使用私人资料。主题、概念和机制等标签提前写在笔记属性里，不是模型现场生成。

展示图来自 **0.3.7 的真实界面渲染器和浏览器测试页**，连接实际的文件读取、搜索控制器与生成文件存储。它们不是原生 Obsidian 截图。测试页中「查看原文」打开的是原文对话框；安装到 Obsidian 后，这个动作打开的是原笔记，不能据浏览器截图声称完成了原生宿主验收。

封面是原创流程示意，不是新界面。展示图只裁剪空白、加步骤说明或并排放置真实截图，不替换按钮、结果或原文。

复现方式：安装 Demo → 复制示例笔记 → 保持「本地摘录」→ 更新 → 搜索 `留白`。展开引用，再点「查看原文」。把发散度设为「中」，点 `不完整信息促使主动补全` 标签，可以找到带相同标签的对话与音乐笔记。这不证明 AI 能自动发现这样的联系。
