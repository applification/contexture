/**
 * Maps scaffolder pre-flight errors to user-facing copy. Kept pure so
 * the dialog component stays dumb and every branch is unit-testable.
 */
export type PreflightError =
  | { kind: 'missing-bun' }
  | { kind: 'missing-git' }
  | { kind: 'missing-node' }
  | { kind: 'no-network' }
  | { kind: 'parent-not-writable'; path: string }
  | { kind: 'target-exists'; path: string }
  | { kind: 'insufficient-space'; bytesFree: number };

export function preflightErrorCopy(error: PreflightError): string {
  switch (error.kind) {
    case 'missing-bun':
      return 'Bun is not installed. Install Bun (https://bun.sh) and try again.';
    case 'missing-git':
      return 'Git is not installed. Install Git and try again.';
    case 'missing-node':
      return 'Node.js is not installed. Install Node and try again.';
    case 'no-network':
      return 'No network connection to the npm registry. Check your connection.';
    case 'parent-not-writable':
      return `Parent folder isn't writable: ${error.path}. Pick another.`;
    case 'target-exists':
      return `A folder already exists at ${error.path}. Pick a different name or parent.`;
    case 'insufficient-space': {
      const mb = Math.round(error.bytesFree / (1024 * 1024));
      return `Not enough free disk space (~${mb} MB available). Free up space or pick another drive.`;
    }
  }
}
