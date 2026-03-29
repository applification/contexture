import { useUIStore } from '@renderer/store/ui';
import { useOntologyStore } from '@renderer/store/ontology';
import { ClassDetail } from './ClassDetail';
import { EdgeDetail } from './EdgeDetail';

export function DetailPanel(): React.JSX.Element | null {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectedEdgeId = useUIStore((s) => s.selectedEdgeId);
  const ontology = useOntologyStore((s) => s.ontology);

  if (selectedNodeId) {
    const cls = ontology.classes.get(selectedNodeId);
    if (cls) return <ClassDetail key={cls.uri} cls={cls} />;
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
