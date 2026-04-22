import { execFileSync } from 'node:child_process';

const ENV_START = '__CONTEXTURE_ENV_START__';
const ENV_END = '__CONTEXTURE_ENV_END__';

// Packaged Electron apps on macOS don't inherit the user's login shell PATH.
// Spawn an interactive login shell to capture PATH and SSH_AUTH_SOCK so that
// child processes (e.g. claude CLI) can be found. Uses sentinel markers to
// robustly extract values even when the shell prints MOTD or other output.
export function syncShellEnvironment(): void {
  if (process.platform !== 'darwin') return;

  try {
    const shell = process.env.SHELL ?? '/bin/zsh';
    const command = [
      `printf '%s\\n' '${ENV_START}'`,
      `printenv PATH || true`,
      `printf '\\n'`,
      `printenv SSH_AUTH_SOCK || true`,
      `printf '\\n%s\\n' '${ENV_END}'`,
    ].join('; ');

    const stdout = execFileSync(shell, ['-ilc', command], {
      encoding: 'utf8',
      timeout: 5000,
    });

    const startIdx = stdout.indexOf(ENV_START);
    const endIdx = stdout.indexOf(ENV_END);
    if (startIdx === -1 || endIdx === -1) return;

    const captured = stdout.substring(startIdx + ENV_START.length + 1, endIdx);
    const lines = captured.split('\n');

    const path = lines[0]?.trim();
    const sshAuthSock = lines[1]?.trim();

    if (path) process.env.PATH = path;
    if (sshAuthSock) process.env.SSH_AUTH_SOCK = sshAuthSock;
  } catch {
    // Keep inherited environment if shell lookup fails
  }
}
