import type { FieldDef } from './ir';

export function fieldIsRuntimeDerived(field: FieldDef): boolean {
  return field.serverDerived === true || field.derivation?.owner === 'backend';
}

export function derivationKindLabel(kind: NonNullable<FieldDef['derivation']>['kind']): string {
  switch (kind) {
    case 'computed':
      return 'computed';
    case 'cachedHandle':
      return 'cache';
    case 'snapshot':
      return 'snapshot';
    case 'rollup':
      return 'rollup';
    case 'estimate':
      return 'estimate';
  }
}
