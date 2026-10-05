import { AI_EDITOR_CAVEAT, CANVAS_OFFSET_CAVEAT } from './core/fragments';
import { LOCAL_LABEL } from './core/util';
import { messages } from './i18n';

// Translate only program-owned explanation grammar. Preserve author/model text.
const prefixes: [string, string][] = [
  ['Lexical baseline: ', '关键词重合：'],
  ['Facet keyword match: ', '属性关键词匹配：'],
  ['Shared topic facet: ', '共同主题：'],
  ['Shared concept facet: ', '共同概念：'],
  ['Suggested shared mechanism: ', '可能的共同机制：'],
  ['Shared atmosphere facet: ', '共同氛围：'],
  ['Facet-based suggestion, not a verified causal relationship; applicability may differ.', '这是基于属性的关联建议，因果关系未经验证；适用条件可能不同。'],
];
const fixed = new Map<string, string>([
  [LOCAL_LABEL, '本地原文摘录，按文字与已有属性检索。'],
  [AI_EDITOR_CAVEAT, '摘要和语义属性是 AI 的编辑判断，尚未证实；本地只核验了原文引用。'],
  [CANVAS_OFFSET_CAVEAT, 'Canvas 文本经过解码，无法映射连续原文位置；已核验解码后的文本引用。'],
  ['A shared declared facet is not proof of semantic equivalence.', '共有属性不代表两段内容的含义相同。'],
  ['Atmosphere is a declared facet, not evidence of causal similarity.', '氛围只是分类属性，不能证明因果机制相似。'],
  ['A matching facet label is a retrieval hint, not evidence of semantic or causal equivalence.', '属性文字匹配只是检索线索，不代表含义相同或因果机制相同。'],
]);
export function presentExplanation(value: string, locale: 'auto' | 'en' | 'zh'): string {
  if (messages(locale) !== messages('zh')) return value;
  const exact = fixed.get(value); if (exact) return exact;
  for (const [prefix, translated] of prefixes) if (value.startsWith(prefix)) return translated + value.slice(prefix.length);
  return value;
}
