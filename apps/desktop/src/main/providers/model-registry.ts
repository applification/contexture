import type { ModelInfo, ModelOptionDescriptor, ProviderKind } from './runtime';

type SelectDescriptor = Extract<ModelOptionDescriptor, { type: 'select' }>;

const LOW_MED_HIGH_MAX_ULTRA = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium', isDefault: true },
  { id: 'high', label: 'High' },
  { id: 'max', label: 'Max' },
  { id: 'xhigh', label: 'Ultrathink' },
];

const LOW_MED_HIGH_ULTRA = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium', isDefault: true },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Ultrathink' },
];

function contextWindow(currentValue?: string): SelectDescriptor {
  return {
    id: 'contextWindow',
    type: 'select',
    label: 'Context',
    options: [
      { id: '200k', label: '200K', isDefault: true },
      { id: '1m', label: '1M' },
    ],
    ...(currentValue ? { currentValue } : {}),
  };
}

const FAST_MODE: ModelOptionDescriptor = {
  id: 'fastMode',
  type: 'boolean',
  label: 'Fast',
  defaultValue: false,
};

const THINKING: ModelOptionDescriptor = {
  id: 'thinking',
  type: 'boolean',
  label: 'Think',
  defaultValue: false,
};

export const CLAUDE_FALLBACK_MODELS: ModelInfo[] = [
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    optionDescriptors: [reasoning(LOW_MED_HIGH_MAX_ULTRA), FAST_MODE, contextWindow()],
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    optionDescriptors: [reasoning(LOW_MED_HIGH_ULTRA), contextWindow()],
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    optionDescriptors: [THINKING],
  },
  {
    id: 'default',
    label: 'Default',
    optionDescriptors: [reasoning(LOW_MED_HIGH_MAX_ULTRA), FAST_MODE],
  },
];

const CODEX_MODEL_OVERLAYS: Array<{
  provider: ProviderKind;
  matches: string[];
  optionDescriptors: ModelOptionDescriptor[];
}> = [
  {
    provider: 'codex',
    matches: ['gpt-5.5', 'gpt-5.4'],
    optionDescriptors: [FAST_MODE],
  },
];

export function overlayModelOptions(provider: ProviderKind, model: ModelInfo): ModelInfo {
  const overlays = CODEX_MODEL_OVERLAYS.filter(
    (entry) =>
      entry.provider === provider &&
      entry.matches.some((match) => model.id.toLowerCase() === match.toLowerCase()),
  );
  if (overlays.length === 0) return model;
  return {
    ...model,
    optionDescriptors: mergeOptionDescriptors([
      ...(model.optionDescriptors ?? []),
      ...overlays.flatMap((entry) => entry.optionDescriptors),
    ]),
  };
}

export function claudeModelFromSdk(value: unknown): ModelInfo | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.value === 'string' ? record.value : null;
  if (!id) return null;
  const displayName = typeof record.displayName === 'string' ? record.displayName : id;
  const description = typeof record.description === 'string' ? record.description : '';
  const supportsEffort = record.supportsEffort === true;
  const supportsAdaptiveThinking = record.supportsAdaptiveThinking === true;
  const supportsFastMode = record.supportsFastMode === true;
  const effortLevels = Array.isArray(record.supportedEffortLevels)
    ? record.supportedEffortLevels.filter((level): level is string => typeof level === 'string')
    : [];
  const optionDescriptors: ModelOptionDescriptor[] = [];
  if (supportsEffort && effortLevels.length > 0) {
    optionDescriptors.push(reasoning(effortOptions(effortLevels)));
  }
  if (supportsAdaptiveThinking && !supportsEffort) optionDescriptors.push(THINKING);
  if (supportsFastMode) optionDescriptors.push(FAST_MODE);
  return {
    id,
    label: claudeDisplayLabel(displayName, description),
    optionDescriptors: mergeOptionDescriptors([
      ...knownClaudeModelOptions(id, displayName, description),
      ...optionDescriptors,
    ]),
  };
}

function reasoning(options: SelectDescriptor['options']): SelectDescriptor {
  return {
    id: 'reasoningEffort',
    type: 'select',
    label: 'Reasoning',
    options,
  };
}

function effortOptions(levels: string[]): SelectDescriptor['options'] {
  const labels: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Ultrathink',
    max: 'Max',
    ultrathink: 'Ultrathink',
  };
  return levels.map((id) => ({
    id,
    label: labels[id] ?? id,
    ...(id === 'medium' ? { isDefault: true } : {}),
  }));
}

function claudeDisplayLabel(displayName: string, description: string): string {
  if (displayName === 'Default (recommended)') {
    const match = description.match(/^(Opus [^·]+)/);
    return match ? `Default (${match[1].trim()})` : 'Default';
  }
  if (displayName === 'Sonnet (1M context)') return 'Sonnet 1M';
  return displayName;
}

function knownClaudeModelOptions(
  id: string,
  displayName: string,
  description: string,
): ModelOptionDescriptor[] {
  const key = `${id} ${displayName} ${description}`.toLowerCase();
  const isOneMillion = key.includes('1m') || key.includes('1m context');
  if (displayName === 'Default (recommended)') {
    return [reasoning(LOW_MED_HIGH_MAX_ULTRA), FAST_MODE];
  }
  if (key.includes('haiku')) return [THINKING];
  if (key.includes('sonnet')) {
    return [reasoning(LOW_MED_HIGH_ULTRA), contextWindow(isOneMillion ? '1m' : undefined)];
  }
  if (key.includes('opus')) {
    const effort = key.includes('4.5')
      ? reasoning(effortOptions(['low', 'medium', 'high', 'max']))
      : reasoning(LOW_MED_HIGH_MAX_ULTRA);
    const descriptors: ModelOptionDescriptor[] = [effort, FAST_MODE];
    if (!key.includes('4.5')) descriptors.push(contextWindow(isOneMillion ? '1m' : undefined));
    return descriptors;
  }
  return [];
}

function mergeOptionDescriptors(descriptors: ModelOptionDescriptor[]): ModelOptionDescriptor[] {
  const seen = new Set<string>();
  const merged: ModelOptionDescriptor[] = [];
  for (const descriptor of descriptors) {
    if (seen.has(descriptor.id)) continue;
    seen.add(descriptor.id);
    merged.push(descriptor);
  }
  return merged;
}
