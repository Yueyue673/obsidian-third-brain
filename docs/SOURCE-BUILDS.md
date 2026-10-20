# Unreleased source builds / 尚未发布的源码构建

[Getting started with the 0.3.7 download](GETTING-STARTED.md) · [中文上手](GETTING-STARTED.md#中文上手) · [Changelog](../CHANGELOG.md)

These are differences in `main`, **not features included in the 0.3.7 download**. This page keeps source-build details out of the first-use instructions. It is not an exhaustive changelog.

## English

Unreleased source builds preserve complete local paragraphs and nested list groups with their full ancestor `#`–`######` headings, up to 16,384 UTF-16 code units for the combined context, so a matching ending is not detached from opening or heading-only conditions. Different heading contexts stay separate when body text matches. Each heading and body has its own verified quotation; the displayed context is assembled, not one contiguous quote. An oversized group blocks the whole refresh with guidance; review a copy without dropping conditions/examples, then retry explicitly. This is structural preservation, not automatic semantic atomicity, and is not yet in download 0.3.7. AI chunking is unchanged. See [Testing status](VERIFICATION.md).

In unreleased source builds, unordered direct children under a one-line list parent ending in `:` or `：` can yield focused excerpts, without requiring `Example:` or `Condition:` labels. The complete parent and shared restrictions remain with the point; omitted siblings appear under **Same-list source context** without another click. Groups with more than 16 points, numbered/standard checklist groups and ambiguous structures remain whole rather than multiplying context or guessing independence. Compare this conservatively retained original text before reusing the point; the plugin has not inferred which siblings are necessary. This context does not turn sibling words into a direct search match. Download 0.3.7 does not include this change.

Unreleased local builds also keep an immediately preceding paragraph ending in `:` or `：` with every root item of its list. Blank lines are allowed; intervening prose, headings, code/hidden boundaries and Canvas nodes end that scope. This preserves explicit introductions, not implied conditions from arbitrary earlier text. The introduction shares the same size/quotation bounds and has its own exact source evidence; AI processing and download 0.3.7 are unchanged.

These builds also retain immediately following, same-indent list items explicitly labelled `Example:`, `Examples:`, `Counterexample:`, `Counterexamples:`, `例子：`, `示例：` or `反例：` with the preceding point, including their descendants. Unlabelled next points remain separate. This preserves literal adjacent example context, not implied references or all Markdown formatting; the same size/evidence bounds apply. AI processing and download 0.3.7 are unchanged.

Source labels use the existing restricted plain-text grammar (letters/numbers, spaces, underscores, plus signs and dashes), not arbitrary YAML values. In unreleased source builds, a quoted unsupported value such as `"inlet, then outlet"` is ignored whole rather than turned into two properties; neighboring supported values remain available. A normal local **Refresh notes** repairs previously parsed explicit labels and their generated links. AI generation settings are unchanged: this does not re-edit cached AI interpretations. Only single-line scalar/list entries are supported, not a general YAML schema. Download 0.3.7 is unchanged.

**Unreleased source builds:** cancelling a note refresh also pauses automatic updates for the current plugin session. With a daily/weekly schedule, the panel keeps a pause reminder visible after searching or reopening it. A successful manual **Refresh notes**, or reloading the plugin, resumes them. Searches and settings saves do not undo this pause; cancelling a search does not pause maintenance. These changes are not included in the 0.3.7 download.

The unreleased source also adds an accessible keyboard-shortcut hint. The 0.3.7 download already supports Ctrl + Enter (Command + Enter on Mac) for searching, but does not show the hint.

## 中文

以下内容属于 `main` 的源码构建，**不在 0.3.7 下载包中**。首次安装和试用请按[中文上手](GETTING-STARTED.md#中文上手)操作；完整改动记录见[更新日志](../CHANGELOG.md)。

尚未发布的源码构建会完整保留本地段落、嵌套列表组及其各级 `#`–`######` 标题，合计最多 16,384 个 UTF-16 代码单元，避免末尾命中丢掉开头或仅写在标题里的条件。正文相同但标题语境不同会保留为不同片段；标题与正文分别核验引文，显示时组合，不伪造一段连续原文。超限会阻止本轮更新并给出提示；请先在副本中检查，保留条件和例子，再明确重试。这是结构保留，不代表已自动拆成语义原子观点；下载版 0.3.7 尚未包含，AI 分块不变。详见[测试记录](VERIFICATION.md)。

尚未发布的源码构建中，单行列表父项以 `:` 或 `：` 结尾时，其直接无序子项可生成聚焦摘录，不必先补写「例子：」「条件：」标签。完整父项和共同限制仍随要点保留，其余同组原文直接显示在「同组原文语境」下，无需另点展开。超过 16 个要点的组、编号／标准复选清单和结构含糊的列表仍整组保留，避免大量重复语境或猜测独立性。复用要点前请对照这些保守保留的同组原文；插件未推断哪些条目是必要前提，也不会把语境里的词算成该要点的直接搜索命中。下载版 0.3.7 尚未包含此改动。

尚未发布的本地构建也会把紧邻列表、以 `:` 或 `：` 结尾的完整前导段落带到每个顶层条目里，中间允许空行。普通正文、新标题、代码／隐藏内容边界和 Canvas 节点会结束这段语境；不会猜测更早文字里的隐含条件。前导段落有自己的精确出处，并计入相同的长度和引文上限；AI 处理与下载版 0.3.7 不变。

这些构建也会把紧跟一个要点、同级且明确以「例子：」「示例：」「反例：」或英文 `Example:`／`Examples:`／`Counterexample:`／`Counterexamples:` 开头的列表项及其子项一并保留。后面没有这些标记的新要点仍单独成片。这只保留相邻、明确标记的例子语境，不推断隐含指代或覆盖所有 Markdown 格式；长度／引文上限、AI 处理和下载版 0.3.7 不变。

来源属性沿用受限的纯文本规则（文字、数字、空格、下划线、加号和连字符），不接受任意 YAML 内容。尚未发布的源码版本会整体忽略 `"inlet, then outlet"` 这类含不支持标点的值，不再拆成两个用户未声明的属性；旁边合法的值仍可使用。本地模式正常「更新笔记」即可修正旧解析属性及生成链接，不重置生成设置，也不会重新提炼已有 AI 缓存。仅支持单行标量／列表条目，不是完整 YAML 解析器；下载版 0.3.7 不变。

**尚未发布的源码版本：**取消笔记更新后，本次插件运行期间的自动更新也会暂停。使用每日或每周更新时，继续搜索或重开面板，仍能看到暂停提示。手动「更新笔记」成功，或重新加载插件后恢复。搜索和保存设置不会解除暂停；取消搜索不影响自动更新。0.3.7 下载包尚不包含这些改动。

源码版本另外增加了输入框的无障碍快捷键提示。0.3.7 下载包已经支持 Ctrl + Enter（Mac 上为 Command + Enter）搜索，但不显示这条提示。
