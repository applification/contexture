import { useOntologyStore } from '@renderer/store/ontology';
import { useUIStore } from '@renderer/store/ui';
import { ClassDetail } from './ClassDetail';
import { EdgeDetail } from './EdgeDetail';

export function DetailPanel(): React.JSX.Element | null {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectedEdgeId = useUIStore((s) => s.selectedEdgeId);
  const ontology = useOntologyStore((s) => s.ontology);

  if (selectedNodeId) {
    const cls = ontology.classes.get(selectedNodeId);
    if (cls) return <ClassDetail key={cls.uri} cls={cls} />;

    const ind = ontology.individuals.get(selectedNodeId);
    if (ind) {
      return (
        <div className="p-3 space-y-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Individual</div>
            <div className="font-medium">
              {ind.label ||
                (() => {
                  const idx = Math.max(ind.uri.lastIndexOf('#'), ind.uri.lastIndexOf('/'));
                  return idx >= 0 ? ind.uri.substring(idx + 1) : ind.uri;
                })()}
            </div>
            <div className="text-xs text-muted-foreground break-all mt-0.5">{ind.uri}</div>
          </div>
          {ind.types.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Type assertions</div>
              <div className="space-y-0.5">
                {ind.types.map((typeUri) => {
                  const cls = ontology.classes.get(typeUri);
                  const idx = Math.max(typeUri.lastIndexOf('#'), typeUri.lastIndexOf('/'));
                  const name = cls?.label || (idx >= 0 ? typeUri.substring(idx + 1) : typeUri);
                  return (
                    <div key={typeUri} className="text-xs bg-secondary rounded px-2 py-1">
                      {name}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {ind.objectPropertyAssertions.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Object property assertions</div>
              <div className="space-y-0.5">
                {ind.objectPropertyAssertions.map((a) => {
                  const pIdx = Math.max(a.property.lastIndexOf('#'), a.property.lastIndexOf('/'));
                  const tIdx = Math.max(a.target.lastIndexOf('#'), a.target.lastIndexOf('/'));
                  return (
                    <div
                      key={`${a.property}-${a.target}`}
                      className="text-xs bg-secondary rounded px-2 py-1"
                    >
                      <span className="font-medium">
                        {pIdx >= 0 ? a.property.substring(pIdx + 1) : a.property}
                      </span>{' '}
                      → {tIdx >= 0 ? a.target.substring(tIdx + 1) : a.target}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {ind.dataPropertyAssertions.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Data property assertions</div>
              <div className="space-y-0.5">
                {ind.dataPropertyAssertions.map((a) => {
                  const pIdx = Math.max(a.property.lastIndexOf('#'), a.property.lastIndexOf('/'));
                  return (
                    <div
                      key={`${a.property}-${a.value}`}
                      className="text-xs bg-secondary rounded px-2 py-1"
                    >
                      <span className="font-medium">
                        {pIdx >= 0 ? a.property.substring(pIdx + 1) : a.property}
                      </span>{' '}
                      = &quot;{a.value}&quot;
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }
  }

  if (selectedEdgeId) {
    // Parse edge ID to find the property
    const objProp = Array.from(ontology.objectProperties.values()).find((p) =>
      selectedEdgeId.startsWith(`objprop-${p.uri}`),
    );
    if (objProp) return <EdgeDetail property={objProp} type="objectProperty" />;

    // Check if it's a subClassOf edge
    if (selectedEdgeId.startsWith('subclass-')) {
      return (
        <div className="p-3 text-sm text-muted-foreground">
          <p className="font-medium mb-1">rdfs:subClassOf</p>
          <p className="text-xs">Inheritance relationship</p>
        </div>
      );
    }
  }

  return null;
}
