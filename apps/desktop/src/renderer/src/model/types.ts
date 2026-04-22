/**
 * Contexture IR shape (v1) — the single source of truth for the schema model.
 *
 * Spec: `plans/pivot.md` §IR shape (v1).
 *
 * The runtime validator lives in `./ir-schema.ts`; the two files must stay in
 * sync. Prefer adding new kinds here first, then extending the Zod meta-schema.
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
