import { buildLayoutOptions } from '@renderer/hooks/useELKLayout';
import { describe, expect, it } from 'vitest';

describe('buildLayoutOptions', () => {
  it('uses a crossing-aware layered layout by default', () => {
    expect(buildLayoutOptions(24, 180)).toMatchObject({
      'elk.algorithm': 'org.eclipse.elk.layered',
      'elk.direction': 'RIGHT',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    });
  });

  it('keeps the organic stress layout available for smaller graphs', () => {
    expect(buildLayoutOptions(24, 180, { layoutMode: 'organic' })).toMatchObject({
      'elk.algorithm': 'org.eclipse.elk.stress',
      'elk.stress.desiredEdgeLength': '360',
    });
  });

  it('uses layered layout for very large graphs even when organic is selected', () => {
    expect(buildLayoutOptions(301, 180, { layoutMode: 'organic' })).toMatchObject({
      'elk.algorithm': 'org.eclipse.elk.layered',
    });
  });
});
