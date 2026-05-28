export const TYPE_NODE_REF_PREVIEW_EVENT = 'contexture:field-ref-preview' as const;

export interface FieldRefPreview {
  sourceType: string;
  sourceField: string;
  targetType: string;
  active: boolean;
}
