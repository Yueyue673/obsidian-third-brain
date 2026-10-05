import { describe, expect, it } from 'vitest';
import { presentExplanation } from '../src/presentation';
import { AI_EDITOR_CAVEAT, CANVAS_OFFSET_CAVEAT } from '../src/core/fragments';
import { LOCAL_LABEL } from '../src/core/util';

describe('program-owned explanation presentation', () => {
  it.each([
    ['Lexical baseline: 变量 · change', '关键词重合：变量 · change'],
    ['Shared topic facet: synthetic topic', '共同主题：synthetic topic'],
    ['Shared concept facet: 合成概念', '共同概念：合成概念'],
    ['Suggested shared mechanism: error-guided adjustment', '可能的共同机制：error-guided adjustment'],
    ['Shared atmosphere facet: quiet', '共同氛围：quiet'],
  ])('localizes the controlled prefix without translating its labels', (input, output) => {
    expect(presentExplanation(input, 'zh')).toBe(output);
    expect(presentExplanation(input, 'en')).toBe(input);
  });
  it.each([AI_EDITOR_CAVEAT, CANVAS_OFFSET_CAVEAT, LOCAL_LABEL])('localizes a controlled caveat %s', input => {
    expect(presentExplanation(input, 'zh')).not.toBe(input);
    expect(presentExplanation(input, 'en')).toBe(input);
  });
  it('never rewrites author/model text or quotations', () => {
    const original = 'Only in this synthetic rehearsal, I chose a slower pace.';
    expect(presentExplanation(original, 'zh')).toBe(original);
  });
  it('keeps actual source conditions after a translated applicability header', () => {
    const header = 'Facet-based suggestion, not a verified causal relationship; applicability may differ.';
    const condition = ' Only after this rehearsal.';
    expect(presentExplanation(header + condition, 'zh')).toContain(condition);
    expect(presentExplanation(header + condition, 'zh')).not.toContain(header);
  });
});
