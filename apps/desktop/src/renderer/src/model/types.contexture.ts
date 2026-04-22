/**
 * Contexture IR shape (v1) — DRAFT for Phase 2.
 *
 * Source of truth: `plans/pivot.md` §IR shape (v1).
 *
 * This file is intentionally unused at this phase: it is a pinned type contract
 * committed during Phase 0 so that Phase 2 work can promote it (and its Zod
 * meta-schema sibling) into the live model layer.
 *
 * Not yet wired up — later Phase 2 slices (#80 onward) promote this into the
 * live model layer and its Zod meta-schema sibling.
 */

export type Schema = {
  version: '1';
  types: TypeDef[];
  imports?: ImportDecl[];
  metadata?: { name?: string; description?: string };
};

export type ImportDecl =
  | { kind: 'stdlib'; path: `@contexture/${string}`; alias: string }
  | { kind: 'relative'; path: string; alias: string };

export type TypeDef =
  | { kind: 'object'; name: string; description?: string; fields: FieldDef[] }
  | {
      kind: 'enum';
      name: string;
      description?: string;
      values: Array<{ value: string; description?: string }>;
    }
  | {
      kind: 'discriminatedUnion';
      name: string;
      description?: string;
      discriminator: string;
      variants: string[];
    }
  | {
      kind: 'raw';
      name: string;
      description?: string;
      zod: string;
      jsonSchema: object;
      import?: { from: string; name: string };
    };

export type FieldDef = {
  name: string;
  description?: string;
  type: FieldType;
  optional?: boolean;
  nullable?: boolean;
  default?: unknown;
};

export type FieldType =
  | {
      kind: 'string';
      min?: number;
      max?: number;
      regex?: string;
      format?: 'email' | 'url' | 'uuid' | 'datetime';
    }
  | { kind: 'number'; min?: number; max?: number; int?: boolean }
  | { kind: 'boolean' }
  | { kind: 'date' }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'ref'; typeName: string }
  | { kind: 'array'; element: FieldType; min?: number; max?: number };
