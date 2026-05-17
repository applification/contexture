import { type ZodType, z } from 'zod';

export const IpcString = z.string().min(1);

export function parseIpcPayload<T>(channel: string, schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
  throw new Error(`Invalid ${channel} payload: ${issues}`);
}
