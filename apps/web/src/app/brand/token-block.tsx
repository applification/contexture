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
--primary:            #8839ef;  /* Latte Mauve */
--primary:            #cba6f7;  /* Mocha Mauve */
--primary-foreground: #eff1f5;  /* light */
--primary-foreground: #11111b;  /* dark  */

/* Reference */
--reference:          #1e66f5;  /* Latte Blue */
--reference:          #89b4fa;  /* Mocha Blue */
--reference-text:     #1a5fd7;  /* Latte accessible Blue text */
--reference-text:     #89b4fa;  /* Mocha Blue text */

/* Accent chrome */
--accent:             #e6e9ef;  /* Latte Mantle */
--accent:             #45475a;  /* Mocha Surface 1 */

/* Backgrounds */
--background:         #eff1f5;  /* Latte Base */
--background:         #1e1e2e;  /* Mocha Base */

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
