export interface ChatContextAttachment {
  id: string;
  path: string;
  name: string;
  size: number;
  content: string;
  truncated?: boolean;
}

export const CHAT_CONTEXT_MAX_FILE_BYTES = 128 * 1024;
export const CHAT_CONTEXT_MAX_TOTAL_BYTES = 256 * 1024;
