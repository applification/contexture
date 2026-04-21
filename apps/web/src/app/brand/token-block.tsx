'use client';

import { FileIcon } from 'lucide-react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';

const tokens = `/* Contexture Design Tokens — CSS Custom Properties */

/* Primary */
--primary:            oklch(0.45 0.15 270);   /* light */
--primary:            oklch(0.65 0.12 280);   /* dark  */
--primary-foreground: oklch(1 0 0);

/* Accent */
--accent:             oklch(0.75 0.15 195);   /* both  */

/* Backgrounds */
--background:         oklch(0.98 0.005 270);  /* light */
--background:         oklch(0.14 0.02 270);   /* dark  */

/* Typography */
--font-sans: Geist Sans (variable, 100-900)
--font-mono: Geist Mono (variable, 100-900)

/* Spacing */
--radius: 0.5rem (8px)
Base unit: 4px (0.25rem)

/* Border radius */
rounded-lg  → 0.5rem
rounded-xl  → 0.75rem`;

export function TokenBlock() {
  return (
    <CodeBlock code={tokens} language="css">
      <CodeBlockHeader>
        <CodeBlockTitle>
          <FileIcon size={14} />
          <CodeBlockFilename>globals.css</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}
