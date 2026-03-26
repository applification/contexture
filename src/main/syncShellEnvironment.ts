import { execFileSync } from 'child_process'

// Packaged Electron apps on macOS don't inherit the user's login shell PATH.
// Read it from a login shell at startup so child processes (e.g. claude CLI) can be found.
export function syncShellEnvironment(): void {
  if (process.platform !== 'darwin') return

  try {
    const shell = process.env.SHELL ?? '/bin/zsh'
    const stdout = execFileSync(shell, ['-l', '-c', 'echo $PATH'], {
      encoding: 'utf8',
      timeout: 3000
    })
    const path = stdout.trim()
    if (path) process.env.PATH = path
  } catch {
    // Keep inherited environment if shell lookup fails
  }
}
