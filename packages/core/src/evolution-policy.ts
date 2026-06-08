import type { Schema } from './ir';

export const EVOLUTION_POLICIES = ['preserveData', 'resettable', 'scratch'] as const;

export type EvolutionPolicy = (typeof EVOLUTION_POLICIES)[number];

export const DEFAULT_EVOLUTION_POLICY: EvolutionPolicy = 'preserveData';

export interface EvolutionPolicyInfo {
  value: EvolutionPolicy;
  label: string;
  guidance: string;
  agentInstruction: string;
}

const POLICY_INFO: Record<EvolutionPolicy, Omit<EvolutionPolicyInfo, 'value'>> = {
  preserveData: {
    label: 'Preserve data',
    guidance:
      'Real data may exist. Prefer additive changes, avoid destructive remodels, and call out migration or data-loss risk.',
    agentInstruction:
      'Assume real data may exist. Prefer additive, migration-aware model changes and call out destructive data risk before proposing deletes, renames, or incompatible reshapes.',
  },
  resettable: {
    label: 'Resettable',
    guidance:
      'Data may exist but can be dropped or regenerated. Breaking model changes are acceptable with a brief reset-impact note.',
    agentInstruction:
      'Data may exist, but it can be discarded or regenerated. You may propose breaking remodels when they simplify the model; mention reset impact briefly instead of designing full migrations.',
  },
  scratch: {
    label: 'Scratch',
    guidance:
      'No meaningful data is expected. Exploratory renames, deletes, and restructures are acceptable without repeated migration caveats.',
    agentInstruction:
      'This is exploratory and no meaningful data is expected. You may freely propose renames, deletes, restructures, and replacement models without repeated migration warnings.',
  },
};

export function getEvolutionPolicy(schema: Pick<Schema, 'metadata'>): EvolutionPolicy {
  return schema.metadata?.evolutionPolicy ?? DEFAULT_EVOLUTION_POLICY;
}

export function describeEvolutionPolicy(
  schemaOrPolicy: Pick<Schema, 'metadata'> | EvolutionPolicy,
): EvolutionPolicyInfo {
  const value =
    typeof schemaOrPolicy === 'string' ? schemaOrPolicy : getEvolutionPolicy(schemaOrPolicy);
  return { value, ...POLICY_INFO[value] };
}
