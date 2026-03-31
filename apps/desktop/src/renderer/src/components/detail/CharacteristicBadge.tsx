import type { OWLCharacteristic } from '@renderer/model/types';
import { Badge } from '@/components/ui/badge';

interface CharInfo {
  label: string;
  tooltip: string;
}

const CHAR_INFO: Record<OWLCharacteristic, CharInfo> = {
  transitive: {
    label: 'Transitive',
    tooltip: 'If A→B and B→C, then A→C is entailed.',
  },
  symmetric: {
    label: 'Symmetric',
    tooltip: 'If A→B, then B→A is entailed.',
  },
  reflexive: {
    label: 'Reflexive',
    tooltip: 'Every individual is related to itself.',
  },
  functional: {
    label: 'Functional',
    tooltip: 'Each subject has at most one value.',
  },
  inverseFunctional: {
    label: 'Inv. Functional',
    tooltip: 'Each value has at most one subject.',
  },
};

interface Props {
  characteristic: OWLCharacteristic;
}

export function CharacteristicBadge({ characteristic }: Props): React.JSX.Element {
  const { label, tooltip } = CHAR_INFO[characteristic];
  return (
    <span>
      <Badge variant="secondary" className="px-2 py-0.5 text-xs">
        {label}
      </Badge>
      <span className="sr-only">{tooltip}</span>
    </span>
  );
}
