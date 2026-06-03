import { type BuildDomainBriefOptions, buildDomainBrief } from './domain-brief';
import type { Schema } from './ir';

export function emitDomainBrief(schema: Schema, options: BuildDomainBriefOptions = {}): unknown {
  return buildDomainBrief(schema, options);
}
