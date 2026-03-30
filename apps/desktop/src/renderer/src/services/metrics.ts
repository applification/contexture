import type { Ontology } from '../model/types';

export interface OntologyMetrics {
  summary: {
    totalClasses: number;
    objectProperties: number;
    datatypeProperties: number;
    individuals: number;
  };
  structure: {
    maxDepth: number;
    avgBreadth: number;
    rootClasses: number;
    leafClasses: number;
    orphanNodes: number;
    multiParentClasses: number;
  };
  connectivity: {
    avgDegree: number;
    maxDegree: number;
    connectedComponents: number;
    isolatedClasses: number;
    disjointnessCoverage: number;
  };
  properties: {
    objDatatypeRatio: number;
    avgPropsPerClass: number;
    classesWithoutProps: number;
    inverseCoverage: number;
    domainlessProps: number;
    rangelessObjProps: number;
  };
  coverage: {
    annotationCoverage: number;
    documentationCoverage: number;
  };
}

export function computeMetrics(ontology: Ontology): OntologyMetrics {
  const { classes, objectProperties, datatypeProperties, individuals } = ontology;

  const totalClasses = classes.size;
  const totalObjProps = objectProperties.size;
  const totalDtProps = datatypeProperties.size;
  const totalIndividuals = individuals.size;

  // Build parent→children map and child→parents map
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  for (const [uri, cls] of classes) {
    if (!childrenOf.has(uri)) childrenOf.set(uri, []);
    parentsOf.set(uri, cls.subClassOf);
    for (const parent of cls.subClassOf) {
      const existing = childrenOf.get(parent);
      if (existing) existing.push(uri);
      else childrenOf.set(parent, [uri]);
    }
  }

  // Root classes: empty subClassOf
  const roots: string[] = [];
  for (const [uri, cls] of classes) {
    if (cls.subClassOf.length === 0) roots.push(uri);
  }

  // Leaf classes: no children
  let leafCount = 0;
  for (const [uri] of classes) {
    const children = childrenOf.get(uri);
    if (!children || children.length === 0) leafCount++;
  }

  // Multi-parent classes
  let multiParentCount = 0;
  for (const [, cls] of classes) {
    if (cls.subClassOf.length > 1) multiParentCount++;
  }

  // Max hierarchy depth — cycle-safe longest path to root per class
  const depthCache = new Map<string, number>();
  function maxDepthOf(uri: string, visiting: Set<string>): number {
    if (depthCache.has(uri)) return depthCache.get(uri) as number;
    const cls = classes.get(uri);
    if (!cls || cls.subClassOf.length === 0) {
      depthCache.set(uri, 0);
      return 0;
    }
    if (visiting.has(uri)) return 0; // cycle
    visiting.add(uri);
    let max = 0;
    for (const parent of cls.subClassOf) {
      if (classes.has(parent)) {
        max = Math.max(max, 1 + maxDepthOf(parent, visiting));
      }
    }
    visiting.delete(uri);
    depthCache.set(uri, max);
    return max;
  }
  let maxDepth = 0;
  for (const [uri] of classes) {
    maxDepth = Math.max(maxDepth, maxDepthOf(uri, new Set()));
  }

  // Avg breadth: average children per non-leaf class
  let nonLeafCount = 0;
  let totalChildren = 0;
  for (const [uri] of classes) {
    const children = childrenOf.get(uri);
    if (children && children.length > 0) {
      nonLeafCount++;
      totalChildren += children.length;
    }
  }
  const avgBreadth = nonLeafCount > 0 ? totalChildren / nonLeafCount : 0;

  // Degree computation (subClassOf + obj prop domain/range, excluding disjointWith)
  const degree = new Map<string, number>();
  for (const [uri] of classes) degree.set(uri, 0);

  // subClassOf edges
  for (const [uri, cls] of classes) {
    for (const parent of cls.subClassOf) {
      if (classes.has(parent)) {
        degree.set(uri, (degree.get(uri) ?? 0) + 1);
        degree.set(parent, (degree.get(parent) ?? 0) + 1);
      }
    }
  }

  // Object property domain/range edges
  const classesInDomainOrRange = new Set<string>();
  for (const [, prop] of objectProperties) {
    for (const d of prop.domain) {
      if (classes.has(d)) {
        degree.set(d, (degree.get(d) ?? 0) + 1);
        classesInDomainOrRange.add(d);
      }
    }
    for (const r of prop.range) {
      if (classes.has(r)) {
        degree.set(r, (degree.get(r) ?? 0) + 1);
        classesInDomainOrRange.add(r);
      }
    }
  }

  // Datatype property domain references
  const classesInAnyDomain = new Set<string>();
  for (const [, prop] of objectProperties) {
    for (const d of prop.domain) classesInAnyDomain.add(d);
  }
  for (const [, prop] of datatypeProperties) {
    for (const d of prop.domain) classesInAnyDomain.add(d);
  }

  let totalDegree = 0;
  let maxDeg = 0;
  let isolatedCount = 0;
  for (const [, deg] of degree) {
    totalDegree += deg;
    if (deg > maxDeg) maxDeg = deg;
    if (deg === 0) isolatedCount++;
  }
  const avgDegree = totalClasses > 0 ? totalDegree / totalClasses : 0;

  // Connected components (union-find on structural edges)
  const parent = new Map<string, string>();
  for (const [uri] of classes) parent.set(uri, uri);

  function find(x: string): string {
    while (parent.get(x) !== x) {
      const grandparent = parent.get(parent.get(x) as string) as string;
      parent.set(x, grandparent);
      x = parent.get(x) as string;
    }
    return x;
  }
  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const [uri, cls] of classes) {
    for (const p of cls.subClassOf) {
      if (classes.has(p)) union(uri, p);
    }
  }
  for (const [, prop] of objectProperties) {
    const domainClasses = prop.domain.filter((d) => classes.has(d));
    const rangeClasses = prop.range.filter((r) => classes.has(r));
    for (let i = 1; i < domainClasses.length; i++) union(domainClasses[0], domainClasses[i]);
    for (let i = 1; i < rangeClasses.length; i++) union(rangeClasses[0], rangeClasses[i]);
    if (domainClasses.length > 0 && rangeClasses.length > 0) {
      union(domainClasses[0], rangeClasses[0]);
    }
  }

  const componentRoots = new Set<string>();
  for (const [uri] of classes) componentRoots.add(find(uri));

  // Orphan nodes: no subClassOf, no subclasses, not in any property domain/range
  let orphanCount = 0;
  for (const [uri, cls] of classes) {
    if (cls.subClassOf.length > 0) continue;
    const children = childrenOf.get(uri);
    if (children && children.length > 0) continue;
    if (classesInDomainOrRange.has(uri)) continue;
    orphanCount++;
  }

  // Disjointness coverage: % of sibling class pairs with disjointWith
  let siblingPairs = 0;
  let disjointPairs = 0;
  for (const [, children] of childrenOf) {
    if (children.length < 2) continue;
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        siblingPairs++;
        const clsI = classes.get(children[i]);
        if (clsI?.disjointWith.includes(children[j])) disjointPairs++;
        else {
          const clsJ = classes.get(children[j]);
          if (clsJ?.disjointWith.includes(children[i])) disjointPairs++;
        }
      }
    }
  }
  const disjointnessCoverage = siblingPairs > 0 ? disjointPairs / siblingPairs : 0;

  // Property metrics
  const objDatatypeRatio = totalDtProps > 0 ? totalObjProps / totalDtProps : totalObjProps;

  let totalDomainRefs = 0;
  let domainlessCount = 0;
  let rangelessObjCount = 0;
  for (const [, prop] of objectProperties) {
    totalDomainRefs += prop.domain.length;
    if (prop.domain.length === 0) domainlessCount++;
    if (prop.range.length === 0) rangelessObjCount++;
  }
  for (const [, prop] of datatypeProperties) {
    totalDomainRefs += prop.domain.length;
    if (prop.domain.length === 0) domainlessCount++;
  }
  const avgPropsPerClass = totalClasses > 0 ? totalDomainRefs / totalClasses : 0;

  let classesWithoutPropsCount = 0;
  for (const [uri] of classes) {
    if (!classesInAnyDomain.has(uri)) classesWithoutPropsCount++;
  }

  let inverseCount = 0;
  for (const [, prop] of objectProperties) {
    if (prop.inverseOf) inverseCount++;
  }
  const inverseCoverage = totalObjProps > 0 ? inverseCount / totalObjProps : 0;

  // Coverage metrics
  let labelCount = 0;
  let commentCount = 0;
  for (const [, cls] of classes) {
    if (cls.label) labelCount++;
    if (cls.comment) commentCount++;
  }
  const annotationCoverage = totalClasses > 0 ? labelCount / totalClasses : 0;
  const documentationCoverage = totalClasses > 0 ? commentCount / totalClasses : 0;

  return {
    summary: {
      totalClasses,
      objectProperties: totalObjProps,
      datatypeProperties: totalDtProps,
      individuals: totalIndividuals,
    },
    structure: {
      maxDepth,
      avgBreadth,
      rootClasses: roots.length,
      leafClasses: leafCount,
      orphanNodes: orphanCount,
      multiParentClasses: multiParentCount,
    },
    connectivity: {
      avgDegree,
      maxDegree: maxDeg,
      connectedComponents: componentRoots.size,
      isolatedClasses: isolatedCount,
      disjointnessCoverage,
    },
    properties: {
      objDatatypeRatio,
      avgPropsPerClass,
      classesWithoutProps: classesWithoutPropsCount,
      inverseCoverage,
      domainlessProps: domainlessCount,
      rangelessObjProps: rangelessObjCount,
    },
    coverage: {
      annotationCoverage,
      documentationCoverage,
    },
  };
}
