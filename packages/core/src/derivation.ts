import type { FieldDef } from './ir';

export type DerivationWriter = 'backend' | 'client' | 'agent' | 'external';

export function fieldIsRuntimeDerived(field: FieldDef): boolean {
  return field.serverDerived === true || field.derivation?.owner === 'backend';
}

export function fieldAllowsWriter(field: FieldDef, writer: DerivationWriter): boolean {
  const writableBy = field.derivation?.writableBy;
  if (writableBy) return writableBy.includes(writer);

  if (field.serverDerived === true) return writer === 'backend';
  if (!field.derivation) return true;

  switch (field.derivation.owner) {
    case 'backend':
      return writer === 'backend';
    case 'external':
      return writer === 'external';
    case 'client':
    case undefined:
      return writer === 'client' || writer === 'agent';
  }
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
