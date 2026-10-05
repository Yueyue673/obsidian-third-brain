export const en = {
  title: 'Third Brain', subtitle: 'Reconnect an idea with notes you already wrote.',
  idea: 'Your idea', placeholder: 'A half-formed topic is enough. You do not need to know its tags.',
  find: 'Find connections', current: 'Use current note', index: 'Refresh notes', cancel: 'Cancel',
  breadth: 'Association breadth', low: 'Low · direct', medium: 'Medium · mechanisms', high: 'High · across domains',
  local: 'Local excerpts · no AI requests', localModel: 'Local model endpoint', cloud: 'Cloud model · consent required',
  first: 'Start with your notes', firstBody: 'Refresh once to build the derived layer. Your original notes stay untouched. You can then describe an idea here.',
  empty: 'No supported connection found', emptyBody: 'Add a little context, try a different idea, or refresh notes that have changed. No results are invented to fill this list.',
  initial: 'Describe an idea to find connections.', loading: 'Loading the generated layer…', indexing: 'Refreshing notes…', searching: 'Finding connections…', idle: 'Ready', cancelled: 'Cancelled · previous index kept', error: 'The task did not complete',
  unavailable: 'The generated index needs review. Original notes are untouched.', failure: 'The previous complete index remains available. Check model settings, source changes or protected-file conflicts.', scheduleWarning: 'Notes were updated, but the refresh schedule could not be saved.',
  source: 'Open original', evidence: 'Source evidence', related: 'Connection', caveat: 'Where the analogy stops',
  excerpt: 'Local excerpt', ai: 'AI-edited fragment', private: 'Local/private context · not sent to cloud',
  contextMissing: 'Open a note with some context, or type an idea here.',
  results: 'connections', sources: 'source notes', fragments: 'fragments', updated: 'Updated',
  facets: 'Explore a facet', quote: 'Original quotation', state: 'Status', conditions: 'Applies when',
  noContext: 'No note context is available in this view.', settings: 'Settings', unknown: 'Not yet indexed',
};
export const zh: Record<keyof typeof en, string> = {
  title: '第三大脑', subtitle: '从一个想法，找回你已经写过的知识。',
  idea: '现在的想法', placeholder: '写一个朦胧的选题也可以，不需要先知道它有什么标签。',
  find: '寻找关联', current: '使用当前笔记', index: '更新笔记', cancel: '取消',
  breadth: '关联发散度', low: '低 · 直接相关', medium: '中 · 相同机制', high: '高 · 跨领域',
  local: '本地摘录 · 不调用 AI', localModel: '本机模型接口', cloud: '云端模型 · 需要明确同意',
  first: '先连接你的笔记', firstBody: '先更新一次，建立独立的提炼层。原始笔记保持不动，然后可以在这里写下想法。',
  empty: '没有找到有依据的关联', emptyBody: '可以补一点语境、换个想法，或更新最近修改的笔记。这里不会为凑数量编造结果。',
  initial: '写下一个想法，看看它与旧知识有什么联系。', loading: '正在加载提炼层…', indexing: '正在更新笔记…', searching: '正在寻找关联…', idle: '可以使用', cancelled: '已取消 · 保留上一轮完整结果', error: '本次操作没有完成',
  unavailable: '提炼层需要检查，原始笔记没有改变。', failure: '上一轮完整结果仍在。请检查模型设置、来源改动或受保护文件冲突。', scheduleWarning: '笔记已更新，但更新计划的时间没有保存成功。',
  source: '查看原文', evidence: '来源证据', related: '为什么有关联', caveat: '判断边界',
  excerpt: '本地摘录', ai: 'AI 编辑片段', private: '本地 / 私密上下文 · 不发到云端',
  contextMissing: '打开一篇有内容的笔记，或直接在这里写一个想法。',
  results: '条关联', sources: '篇来源笔记', fragments: '个片段', updated: '更新于',
  facets: '按属性继续找', quote: '原文引用', state: '状态', conditions: '适用条件',
  noContext: '此界面没有当前笔记上下文。', settings: '设置', unknown: '尚未更新',
};
export function messages(locale: 'auto' | 'en' | 'zh'): typeof en {
  const language = locale === 'auto' ? (typeof navigator === 'undefined' ? 'en' : navigator.language) : locale;
  return /^zh/i.test(language) ? zh : en;
}
