import { z } from 'zod';
import type { OpToolDescriptor } from '../../ops';
import type {
  DynamicToolCallParams,
  DynamicToolCallResponse,
  DynamicToolSpec,
  JsonValue,
} from './types';

export const CODEX_CONTEXTURE_TOOL_NAMESPACE = 'contexture';

export function toCodexDynamicTools(descriptors: OpToolDescriptor[]): DynamicToolSpec[] {
  return descriptors.map((descriptor) => ({
    namespace: CODEX_CONTEXTURE_TOOL_NAMESPACE,
    name: descriptor.name,
    description: descriptor.description,
    inputSchema: z.toJSONSchema(z.object(descriptor.inputSchema)) as JsonValue,
  }));
}

export async function handleCodexDynamicToolCall(
  params: DynamicToolCallParams,
  descriptors: OpToolDescriptor[],
): Promise<DynamicToolCallResponse> {
  if (params.namespace !== CODEX_CONTEXTURE_TOOL_NAMESPACE) {
    return failure(`Unsupported tool namespace: ${params.namespace ?? '(none)'}`);
  }

  const descriptor = descriptors.find((tool) => tool.name === params.tool);
  if (!descriptor) return failure(`Unknown Contexture tool: ${params.tool}`);

  try {
    const args = params.arguments;
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return failure(`Tool arguments for ${params.tool} must be an object`);
    }
    const result = await descriptor.handler(args as Record<string, unknown>);
    return {
      success: !isToolError(result),
      contentItems: [{ type: 'inputText', text: JSON.stringify(result) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(message);
  }
}

function isToolError(value: unknown): value is { error: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof (value as { error?: unknown }).error === 'string'
  );
}

function failure(message: string): DynamicToolCallResponse {
  return {
    success: false,
    contentItems: [{ type: 'inputText', text: message }],
  };
}
