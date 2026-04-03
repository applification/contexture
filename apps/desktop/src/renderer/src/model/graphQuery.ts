import type { Ontology } from './types';

export type GraphQueryType =
  | 'subclasses'
  | 'superclasses'
  | 'class_properties'
  | 'class_info'
  | 'instances'
  | 'all_classes'
  | 'all_properties'
  | 'search';

export interface GraphQuery {
  type: GraphQueryType;
  classUri?: string;
  transitive?: boolean;
  query?: string;
}

export type GraphQueryResult = Record<string, unknown>;

function labelOf(uri: string, ontology: Ontology): string {
  return (
    ontology.classes.get(uri)?.label ||
    ontology.objectProperties.get(uri)?.label ||
    ontology.datatypeProperties.get(uri)?.label ||
    uri
  );
}

export function executeGraphQuery(ontology: Ontology, query: GraphQuery): GraphQueryResult {
  switch (query.type) {
    case 'subclasses': {
      const classUri = query.classUri;
      if (!classUri) return { error: 'classUri is required for subclasses query' };
      const results: { uri: string; label: string; comment?: string; direct: boolean }[] = [];
      const visited = new Set<string>();
      const queue: Array<{ uri: string; isDirect: boolean }> = [{ uri: classUri, isDirect: true }];
      while (queue.length > 0) {
        // biome-ignore lint/style/noNonNullAssertion: queue.length > 0 guarantees shift() is defined
        const { uri: current, isDirect } = queue.shift()!;
        for (const [uri, cls] of ontology.classes) {
          if (cls.subClassOf.includes(current) && !visited.has(uri)) {
            visited.add(uri);
            results.push({
              uri,
              label: cls.label || uri,
              comment: cls.comment,
              direct: isDirect,
            });
            if (query.transitive !== false) {
              queue.push({ uri, isDirect: false });
            }
          }
        }
      }
      return { classUri, subclasses: results, count: results.length };
    }

    case 'superclasses': {
      const classUri = query.classUri;
      if (!classUri) return { error: 'classUri is required for superclasses query' };
      const cls0 = ontology.classes.get(classUri);
      if (!cls0) return { error: `Class not found: ${classUri}` };
      const results: { uri: string; label: string; comment?: string }[] = [];
      const visited = new Set<string>();
      const recurse = (uri: string): void => {
        const cls = ontology.classes.get(uri);
        if (!cls) return;
        for (const parentUri of cls.subClassOf) {
          if (!visited.has(parentUri)) {
            visited.add(parentUri);
            const parent = ontology.classes.get(parentUri);
            results.push({
              uri: parentUri,
              label: parent?.label || parentUri,
              comment: parent?.comment,
            });
            if (query.transitive !== false) recurse(parentUri);
          }
        }
      };
      recurse(classUri);
      return { classUri, superclasses: results, count: results.length };
    }

    case 'class_properties': {
      const classUri = query.classUri;
      if (!classUri) return { error: 'classUri is required for class_properties query' };
      const objectProps = [];
      for (const prop of ontology.objectProperties.values()) {
        if (prop.domain.includes(classUri)) {
          objectProps.push({
            uri: prop.uri,
            label: prop.label || prop.uri,
            comment: prop.comment,
            range: prop.range.map((r) => ({ uri: r, label: labelOf(r, ontology) })),
            characteristics: prop.characteristics,
          });
        }
      }
      const datatypeProps = [];
      for (const prop of ontology.datatypeProperties.values()) {
        if (prop.domain.includes(classUri)) {
          datatypeProps.push({
            uri: prop.uri,
            label: prop.label || prop.uri,
            comment: prop.comment,
            range: prop.range,
          });
        }
      }
      return { classUri, objectProperties: objectProps, datatypeProperties: datatypeProps };
    }

    case 'class_info': {
      const classUri = query.classUri;
      if (!classUri) return { error: 'classUri is required for class_info query' };
      const cls = ontology.classes.get(classUri);
      if (!cls) return { error: `Class not found: ${classUri}` };
      return {
        uri: cls.uri,
        label: cls.label,
        comment: cls.comment,
        superclasses: cls.subClassOf.map((uri) => ({
          uri,
          label: ontology.classes.get(uri)?.label || uri,
        })),
        disjointWith: cls.disjointWith.map((uri) => ({
          uri,
          label: ontology.classes.get(uri)?.label || uri,
        })),
        restrictions: cls.restrictions || [],
        classExpressions: cls.classExpressions || [],
      };
    }

    case 'instances': {
      const classUri = query.classUri;
      if (!classUri) return { error: 'classUri is required for instances query' };
      const results = [];
      for (const ind of ontology.individuals.values()) {
        if (ind.types.includes(classUri)) {
          results.push({
            uri: ind.uri,
            label: ind.label || ind.uri,
            comment: ind.comment,
            objectAssertions: ind.objectPropertyAssertions,
            dataAssertions: ind.dataPropertyAssertions,
          });
        }
      }
      return { classUri, individuals: results, count: results.length };
    }

    case 'all_classes': {
      const classes = Array.from(ontology.classes.values()).map((cls) => ({
        uri: cls.uri,
        label: cls.label || cls.uri,
        comment: cls.comment,
        superclasses: cls.subClassOf,
      }));
      return { classes, count: classes.length };
    }

    case 'all_properties': {
      const objectProps = Array.from(ontology.objectProperties.values()).map((p) => ({
        uri: p.uri,
        label: p.label || p.uri,
        comment: p.comment,
        domain: p.domain,
        range: p.range,
        characteristics: p.characteristics,
        type: 'object' as const,
      }));
      const datatypeProps = Array.from(ontology.datatypeProperties.values()).map((p) => ({
        uri: p.uri,
        label: p.label || p.uri,
        comment: p.comment,
        domain: p.domain,
        range: p.range,
        type: 'datatype' as const,
      }));
      const properties = [...objectProps, ...datatypeProps];
      return { properties, count: properties.length };
    }

    case 'search': {
      const q = (query.query || '').toLowerCase();
      if (!q) return { error: 'query is required for search' };
      const results: { uri: string; label: string; comment?: string; elementType: string }[] = [];
      for (const cls of ontology.classes.values()) {
        const label = cls.label || '';
        if (
          label.toLowerCase().includes(q) ||
          cls.uri.toLowerCase().includes(q) ||
          (cls.comment || '').toLowerCase().includes(q)
        ) {
          results.push({
            uri: cls.uri,
            label: label || cls.uri,
            comment: cls.comment,
            elementType: 'class',
          });
        }
      }
      for (const prop of ontology.objectProperties.values()) {
        const label = prop.label || '';
        if (label.toLowerCase().includes(q) || prop.uri.toLowerCase().includes(q)) {
          results.push({
            uri: prop.uri,
            label: label || prop.uri,
            comment: prop.comment,
            elementType: 'objectProperty',
          });
        }
      }
      for (const prop of ontology.datatypeProperties.values()) {
        const label = prop.label || '';
        if (label.toLowerCase().includes(q) || prop.uri.toLowerCase().includes(q)) {
          results.push({
            uri: prop.uri,
            label: label || prop.uri,
            comment: prop.comment,
            elementType: 'datatypeProperty',
          });
        }
      }
      for (const ind of ontology.individuals.values()) {
        const label = ind.label || '';
        if (label.toLowerCase().includes(q) || ind.uri.toLowerCase().includes(q)) {
          results.push({
            uri: ind.uri,
            label: label || ind.uri,
            comment: ind.comment,
            elementType: 'individual',
          });
        }
      }
      return { query: query.query, results, count: results.length };
    }

    default:
      return { error: `Unknown query type: ${(query as GraphQuery).type}` };
  }
}
