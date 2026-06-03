import { describe, expect, it } from 'vitest';
import { buildDomainBrief, emitDomainBrief, type Schema } from '../src';

describe('domain brief', () => {
  it('summarizes declared contracts and unresolved review items', () => {
    const schema: Schema = {
      version: '1',
      metadata: { name: 'Operations' },
      outputs: { aiPipeline: { domainBrief: { enabled: true } } },
      types: [
        { kind: 'object', name: 'Tenant', table: true, fields: [] },
        {
          kind: 'object',
          name: 'Project',
          table: true,
          fields: [
            { name: 'tenantId', type: { kind: 'ref', typeName: 'Tenant' } },
            { name: 'searchText', type: { kind: 'string' } },
            {
              name: 'summary',
              type: { kind: 'string' },
              derivation: {
                kind: 'computed',
                sources: ['searchText'],
                refresh: 'onWrite',
                owner: 'backend',
                writableBy: ['backend'],
              },
            },
            { name: 'tags', type: { kind: 'array', element: { kind: 'string' } } },
          ],
          indexes: [{ name: 'by_tenant', fields: ['tenantId'] }],
          searchIndexes: [
            { name: 'search_projects', searchField: 'searchText', filterFields: ['tenantId'] },
          ],
          invariants: [
            {
              kind: 'fieldPredicate',
              name: 'search-text-required',
              field: 'searchText',
              predicate: { kind: 'nonEmptyTrimmedString' },
            },
          ],
        },
        {
          kind: 'object',
          name: 'Task',
          table: true,
          fields: [
            { name: 'tenantId', type: { kind: 'ref', typeName: 'Tenant' } },
            {
              name: 'projectId',
              type: {
                kind: 'ref',
                typeName: 'Project',
                relationship: {
                  onDelete: 'restrict',
                  ownership: { scopeField: 'tenantId' },
                },
              },
            },
          ],
        },
      ],
    };

    const brief = buildDomainBrief(schema);

    expect(brief.summary).toMatchObject({
      typeCount: 3,
      tableCount: 3,
      invariantCount: 1,
      derivationCount: 1,
      relationshipCount: 1,
      queryContractCount: 2,
    });
    expect(brief.declaredDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'invariant',
          id: 'invariant:Project:search-text-required',
        }),
        expect.objectContaining({ kind: 'derivation', id: 'derivation:Project:summary' }),
        expect.objectContaining({ kind: 'relationship', id: 'relationship:Task:projectId' }),
        expect.objectContaining({ kind: 'query', id: 'query:index:Project:by_tenant' }),
        expect.objectContaining({ kind: 'query', id: 'query:search:Project:search_projects' }),
      ]),
    );
    expect(brief.unresolvedDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'modeling_hint',
          title: 'Bounded array scan',
          scope: 'Project.tags',
        }),
      ]),
    );
  });

  it('emits a JSON-serializable brief object', () => {
    const schema: Schema = {
      version: '1',
      types: [{ kind: 'object', name: 'Post', table: true, fields: [] }],
    };

    expect(JSON.parse(JSON.stringify(emitDomainBrief(schema)))).toMatchObject({
      version: 1,
      summary: { typeCount: 1, tableCount: 1 },
    });
  });
});
