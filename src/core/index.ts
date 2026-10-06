export type * from './types';
export { emptyFacets, emptyIndex } from './types';
export { prepareSource } from './sources';
export { analyzeSource } from './extraction';
export { searchFragments, vocabularyOf } from './retrieval';
export { interpretQuery } from './model';
import { buildIndex as stageIndex } from './engine';
import { digest } from './util';
import type { IndexState, RunOptions, SourceSnapshot } from './types';

/** Version the AI editing policy at the public generation boundary, not the
 * persisted schema. Local excerpt generations retain their exact signature.
 */
export function buildIndex(inputs: SourceSnapshot[], options: RunOptions): Promise<IndexState> {
  const signature = options.signature;
  if (options.mode === 'local-excerpts' || typeof signature !== 'string' || !signature || signature.length > 4096) return stageIndex(inputs,options);
  return stageIndex(inputs,{ ...options,signature:digest(JSON.stringify({ generation:signature,editor:'source-context-1' })) });
}
