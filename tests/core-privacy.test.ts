import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { analyzeSource, emptyFacets, interpretQuery, prepareSource, vocabularyOf } from '../src/core';
import type { Facets, ModelPort, ModelRequest } from '../src/core';

const NOW = '2026-01-02T03:04:05.000Z';
function source(raw: string, path = 'synthetic/source.md') { return prepareSource(path,raw,createHash('sha256').update(raw).digest('hex'),'synthetic-id'); }
function extraction(text: string) { return { version:1,decision:'extract',fragments:[{ title:'Excerpt selection',summary:text,kind:'excerpt',topics:[],concepts:[],mechanisms:[],atmosphere:[],quotes:[text],conditions:[],caveats:[] }] }; }
const cloud = (model: ModelPort) => ({ mode:'cloud-model' as const,cloudConsent:true,model,now:NOW });
const VOCAB: Facets = { topics:['practice'],concepts:[],mechanisms:['feedback loop'],atmosphere:[] };

describe('raw-first privacy and credential barriers', () => {
  it.each([
    '---\nprivacy: private\n---\nA readable idea.',
    '---\nsensitivity: local\n---\nA readable idea.',
    '---\nkanban-plugin: board\nprivacy: local\n---\n- [ ] A useful task.',
    '---\nexcalidraw-plugin: parsed\nsensitivity: private\n---\n# Text Elements\nA useful note.',
    '---\nthird-brain:\n  privacy: private\n---\nA readable idea.',
    '---\nthird-brain: {privacy: local, plugin: board}\n---\nA readable idea.',
    '---\nprivacy: "local" # stay on-device\n---\nA readable idea.',
    '---\nprivacy: secret-unknown-value\n---\nA readable idea.',
    '---\nprivacy: private\nA malformed frontmatter idea.',
  ])('never sends protected plugin/frontmatter material to a cloud port', async raw => {
    const request = vi.fn(async () => extraction('Synthetic response.'));
    const snapshot = source(raw), result = await analyzeSource(snapshot,cloud({ request }));
    expect(snapshot.privacy).not.toBe('normal'); expect(result.status).toBe('local-only'); expect(result.fragments).toEqual([]); expect(request).not.toHaveBeenCalled();
  });
  it('inspects raw Canvas metadata and embedded node frontmatter before removing anything', async () => {
    for (const raw of [
      JSON.stringify({ nodes:[{ type:'text',text:'A normal visible idea.' }],edges:[{ custom:{ privacy:'private' } }] }),
      JSON.stringify({ nodes:[{ type:'text',text:'---\nprivacy: local\n---\nA useful text node.' }],edges:[] }),
      JSON.stringify({ nodes:[{ type:'file',file:'only-metadata.md',privacy:'private' }],edges:[] }),
    ]) {
      const request = vi.fn(async () => extraction('Synthetic response.'));
      expect((await analyzeSource(source(raw,'synthetic/metadata.canvas'),cloud({ request }))).status).toBe('local-only'); expect(request).not.toHaveBeenCalled();
    }
  });
  it('rejects duplicate Canvas policy keys instead of allowing a last-value downgrade', () => {
    expect(() => source('{"nodes":[],"privacy":"private","privacy":"normal"}','synthetic/duplicate.canvas')).toThrow(/Canvas/);
    expect(() => source('{"nodes":[],"priva\\u0063y":"local","privacy":"normal"}','synthetic/duplicate.canvas')).toThrow(/Canvas/);
  });
  it('cannot bypass raw policy with a manually downgraded snapshot', async () => {
    const protectedSource = source('---\nprivacy: private\n---\nActual private knowledge.'), request = vi.fn(async () => extraction('Unused response.'));
    const result = await analyzeSource({ ...protectedSource,privacy:'normal' },cloud({ request }));
    expect(result.status).toBe('local-only'); expect(request).not.toHaveBeenCalled();
  });
  it('allows explicit local-model processing of private content, not cloud processing', async () => {
    const snapshot = source('---\nprivacy: private\ntopics: [private-topic]\n---\nPrivate practice stays on-device.'), request = vi.fn(async (input: ModelRequest) => extraction(input.text));
    const result = await analyzeSource(snapshot,{ mode:'local-model',cloudConsent:false,model:{ request },now:NOW });
    expect(result.status).toBe('indexed'); expect(result.fragments[0].privacy).toBe('private'); expect(request).toHaveBeenCalledOnce();
  });
  it('requires explicit cloud consent and a model port for nonempty model-mode input', async () => {
    const request = vi.fn(async (input: ModelRequest) => extraction(input.text));
    await expect(analyzeSource(source('A useful observation.'),{ ...cloud({ request }),cloudConsent:false })).rejects.toThrow(/consent/);
    expect(request).not.toHaveBeenCalled();
    await expect(analyzeSource(source('A useful observation.'),{ mode:'local-model',cloudConsent:false })).rejects.toThrow(/model port/);
  });
  it.each([
    'password: synthetic-secret-only-for-unit-test\nA useful paragraph.',
    'token: synthetic-token-only-for-unit-test\nA useful paragraph.',
    'secret: [synthetic-bracketed-value]\nA useful paragraph.',
    'pwd: x\nA useful paragraph.',
    '---\napi_key: synthetic-key-only-for-unit-test\n---\nA useful paragraph.',
    'Authorization: Bearer synthetic-test-value\nA useful paragraph.',
    'Cookie: synthetic-test-session\nA useful paragraph.',
    'Read https://example.invalid/?token=synthetic-only-for-test and learn something.',
    'Read https://synthetic-user:synthetic-pass@example.invalid/ and learn something.',
    '```text\n' + '-----BEGIN ' + 'PRIVATE KEY-----\nsynthetic-test-only\n```\nA useful paragraph.',
  ])('blocks credential sources before any extraction or model call', async raw => {
    const request = vi.fn(async () => extraction('Unused response.'));
    expect((await analyzeSource(source(raw),cloud({ request }))).status).toBe('sensitive');
    expect((await analyzeSource(source(raw),{ mode:'local-excerpts',cloudConsent:false })).status).toBe('sensitive'); expect(request).not.toHaveBeenCalled();
  });
  it('blocks credentials even in Canvas metadata excluded from readable text', async () => {
    const raw = JSON.stringify({ nodes:[{ type:'text',text:'A useful public excerpt.' }],custom:{ password:'synthetic-password-only-for-test' } }), request = vi.fn(async () => extraction('Unused response.'));
    expect((await analyzeSource(source(raw,'synthetic/test.canvas'),cloud({ request }))).status).toBe('sensitive'); expect(request).not.toHaveBeenCalled();
  });
  it('blocks escaped Canvas credential keys and text before transform', async () => {
    const examples = [
      '{"nodes":[{"type":"text","text":"A useful public note."}],"custom":{"pass\\u0077ord":"synthetic-test-value"}}',
      '{"nodes":[{"type":"text","text":"api\\u005fkey: synthetic-test-value"}],"edges":[]}',
    ];
    for (const raw of examples) {
      const request = vi.fn(async () => extraction('Unused response.'));
      expect((await analyzeSource(source(raw,'synthetic/escaped.canvas'),cloud({ request }))).status).toBe('sensitive'); expect(request).not.toHaveBeenCalled();
    }
  });
  it('redacts common PII and paths before requests, maps clean quotes to original offsets', async () => {
    const raw = '---\ntopics: [practice, private/path.md]\n---\nContact synthetic.person@example.invalid or +1 (212) 555-0198; mobile 13800138000; ID 11010519491231002X; SSN 123-45-6789. Read [[synthetic/private.md|label]] or [file](synthetic/other.md), C:\\SyntheticVault\\private.md. Clean practice preserves exact evidence.';
    const requests: ModelRequest[] = [], quote = 'Clean practice preserves exact evidence.';
    const model: ModelPort = { request:async input => { requests.push(input); return extraction(quote); } };
    const snapshot = source(raw,'synthetic/never-name-this.md'), result = await analyzeSource(snapshot,cloud(model));
    const sent = JSON.stringify(requests);
    for (const disallowed of ['synthetic.person','212','13800138000','11010519491231002X','123-45-6789','private.md','other.md','never-name-this']) expect(sent).not.toContain(disallowed);
    expect(sent).toContain('[REDACTED]'); expect(result.fragments[0].summary).toBe(quote);
    const evidence = result.fragments[0].evidence[0]; expect(evidence.start).toBe(raw.indexOf(quote)); expect(raw.slice(evidence.start,evidence.end)).toBe(quote);
  });
  it('rejects quotes covering redaction placeholders rather than inventing original spans', async () => {
    const request = vi.fn(async (input: ModelRequest) => extraction(input.text));
    await expect(analyzeSource(source('Email synthetic.person@example.invalid for deliberate practice.'),cloud({ request }))).rejects.toThrow(/Unsafe/);
  });
  it('never adds private/local derivative vocabulary to cloud-safe vocabulary', async () => {
    const analyses = await Promise.all([
      analyzeSource(source('---\ntopics: [public-topic]\n---\nA public useful observation.'),{ mode:'local-excerpts',cloudConsent:false }),
      analyzeSource(source('---\nprivacy: local\ntopics: [local-hidden-topic]\nmechanisms: [local-hidden-mechanism]\n---\nA local useful observation.'),{ mode:'local-excerpts',cloudConsent:false }),
      analyzeSource(source('---\nprivacy: private\nconcepts: [private-hidden-concept]\n---\nA private useful observation.'),{ mode:'local-excerpts',cloudConsent:false }),
    ]);
    const fragments = analyses.flatMap(analysis => analysis.fragments);
    expect(vocabularyOf(fragments).topics).toContain('local-hidden-topic'); expect(vocabularyOf(fragments,true)).toEqual({ ...emptyFacets(),topics:['public-topic'] });
    const unknown = { ...fragments[0],privacy:undefined } as unknown as typeof fragments[number];
    expect(vocabularyOf([unknown],true)).toEqual(emptyFacets());
  });
});

describe('bounded strict query interpretation', () => {
  it('redacts question PII and source paths; returns only existing canonical facets', async () => {
    const request = vi.fn(async (_input: ModelRequest) => JSON.stringify({ version:1,topics:['practice'],concepts:[],mechanisms:['feedback loops'],atmosphere:[] }));
    const query = 'Can deliberate practice help synthetic.person@example.invalid? Read C:\\SyntheticVault\\private.md and [[secret/path.md]].';
    const result = await interpretQuery(query,{ request },VOCAB);
    expect(result.mechanisms).toEqual(['反馈循环']);
    const input = request.mock.calls[0][0] as unknown as ModelRequest;
    expect(JSON.stringify(input)).not.toContain('synthetic.person'); expect(JSON.stringify(input)).not.toContain('private.md'); expect(JSON.stringify(input)).not.toContain('path.md'); expect(input.text).toContain('[REDACTED]');
  });
  it('does not invoke a model for credentials, blank questions, or empty vocabulary', async () => {
    const request = vi.fn(async (_input: ModelRequest) => ({ version:1,...emptyFacets() }));
    for (const query of ['', '  ', 'password: synthetic-unit-test-secret']) expect(await interpretQuery(query,{ request },VOCAB)).toEqual(emptyFacets());
    expect(await interpretQuery('Some useful query.',{ request },emptyFacets())).toEqual(emptyFacets()); expect(request).not.toHaveBeenCalled();
  });
  it('removes unsafe vocabulary strings before invoking a model', async () => {
    const request = vi.fn(async (_input: ModelRequest) => ({ version:1,...emptyFacets() }));
    await interpretQuery('A deliberate practice query.',{ request },{ topics:['practice','private/path.md','synthetic.person@example.invalid'],concepts:[],mechanisms:[],atmosphere:[] });
    const input = request.mock.calls[0][0] as unknown as ModelRequest; expect(input.vocabulary.topics).toEqual(['practice']);
  });
  it.each([
    { version:2,...emptyFacets() },
    { version:1,...emptyFacets(),outputPath:'arbitrary.md' },
    { version:1,...emptyFacets(),topics:'practice' },
    { version:1,...emptyFacets(),topics:['unseen'] },
    { version:1,...emptyFacets(),topics:[3] },
    '{"version":1,"topics":[],"concepts":[],"mechanisms":[],"atmosphere":[]} junk',
    null,
  ])('rejects malformed/unknown query output', async output => {
    await expect(interpretQuery('Deliberate practice query.',{ request:async () => output },VOCAB)).rejects.toThrow();
  });
});

describe('cancellation is prompt and drops late model results', () => {
  it('aborts before invoking a port', async () => {
    const controller = new AbortController(); controller.abort(); const request = vi.fn(async () => extraction('Unused response.'));
    await expect(analyzeSource(source('A useful real observation.'),{ ...cloud({ request }),signal:controller.signal })).rejects.toMatchObject({ name:'AbortError' });
    await expect(interpretQuery('Practice question.',{ request },VOCAB,controller.signal)).rejects.toMatchObject({ name:'AbortError' }); expect(request).not.toHaveBeenCalled();
  });
  it('rejects in-flight extraction immediately even when the port ignores the signal', async () => {
    const controller = new AbortController(); let finish!: (value:unknown) => void, started!: () => void;
    const active = new Promise<void>(resolve => { started=resolve; });
    const model: ModelPort = { request:() => { started(); return new Promise(resolve => { finish=resolve; }); } };
    const task = analyzeSource(source('A useful real observation.'),{ ...cloud(model),signal:controller.signal });
    await active; controller.abort(); await expect(task).rejects.toMatchObject({ name:'AbortError' }); finish(extraction('A useful real observation.')); await Promise.resolve();
  });
  it('rejects in-flight interpretation and never accepts a late response', async () => {
    const controller = new AbortController(); let finish!: (value:unknown) => void, started!: () => void;
    const active = new Promise<void>(resolve => { started=resolve; });
    const task = interpretQuery('Deliberate practice query.',{ request:() => { started(); return new Promise(resolve => { finish=resolve; }); } },VOCAB,controller.signal);
    await active; controller.abort(); await expect(task).rejects.toMatchObject({ name:'AbortError' }); finish({ version:1,...emptyFacets() }); await Promise.resolve();
  });
});
