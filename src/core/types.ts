export type Mode = 'local-excerpts' | 'local-model' | 'cloud-model';
export type Breadth = 'low' | 'medium' | 'high';
export type Privacy = 'normal' | 'local' | 'private';
export interface Facets { topics: string[]; concepts: string[]; mechanisms: string[]; atmosphere: string[]; }
export interface SourceSnapshot { id: string; path: string; text: string; hash: string; privacy: Privacy; format: 'markdown' | 'canvas'; }
export interface Evidence { sourceId: string; relativePath: string; sourceHash: string; quote: string; start: number; end: number; }
export interface Fragment { id: string; privacy: Privacy; title: string; summary: string; kind: string; facets: Facets; evidence: Evidence[]; mode: 'local' | 'ai'; updatedAt: string; conditions: string[]; caveats: string[]; }
export type SourceStatus = 'indexed' | 'empty' | 'insufficient-context' | 'sensitive' | 'local-only' | 'error';
export interface SourceRecord { hash: string; status: SourceStatus; fragmentIds: string[]; }
export interface IndexState { version: 1; signature: string; updatedAt: string; sources: Record<string, SourceRecord>; fragments: Record<string, Fragment>; }
export interface Analysis { status: SourceStatus; fragments: Fragment[]; }
export interface ModelRequest { task: 'extract' | 'interpret'; text: string; vocabulary: Facets; }
export interface ModelPort { request(input: ModelRequest, signal?: AbortSignal): Promise<unknown>; }
export interface AnalyzeOptions { mode: Mode; cloudConsent: boolean; model?: ModelPort; vocabulary?: Facets; now?: string; signal?: AbortSignal; }
export interface RelationReason { kind: 'content' | 'topic' | 'concept' | 'mechanism' | 'analogy' | 'atmosphere'; label: string; quotes: string[]; caveat?: string; }
export interface SearchResult { fragment: Fragment; score: number; reasons: RelationReason[]; }
export interface SearchOptions { breadth: Breadth; limit?: number; facets?: Partial<Facets>; excludeSource?: string; }
export interface StorePort { load(): Promise<IndexState | null>; commit(next: IndexState, verifySources?: () => Promise<void>, signal?: AbortSignal): Promise<void>; recover(): Promise<void>; }
export interface TransportOptions { mode: 'local-model' | 'cloud-model'; endpoint: string; model: string; secret?: string; cloudConsent: boolean; timeoutMs?: number; maxResponseBytes?: number; }
export interface RunProgress { completed: number; total: number; phase: 'reading' | 'processing' | 'committing' | 'done' | 'cancelled'; }
export interface RunOptions extends AnalyzeOptions { signature: string; previous: IndexState | null; onProgress?: (progress: RunProgress) => void; recheck?: (snapshot: SourceSnapshot) => Promise<SourceSnapshot | null>; }
export const emptyFacets = (): Facets => ({ topics: [], concepts: [], mechanisms: [], atmosphere: [] });
export const emptyIndex = (): IndexState => ({ version: 1, signature: '', updatedAt: '', sources: {}, fragments: {} });
