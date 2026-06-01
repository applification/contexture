export interface ChatContextAttachment {
  id: string;
  path: string;
  name: string;
  size: number;
  content: string;
  kind?: 'text' | 'image';
  mimeType?: string;
  encoding?: 'base64';
  truncated?: boolean;
}

export const CHAT_CONTEXT_MAX_FILE_BYTES = 128 * 1024;
export const CHAT_CONTEXT_MAX_IMAGE_BYTES = 1024 * 1024;
export const CHAT_CONTEXT_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
