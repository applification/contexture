import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { CodexJsonRpcClient } from './json-rpc';

export type SpawnCodexAppServerFn = (
  command: string,
  args: string[],
  options: { stdio: 'pipe'; env: NodeJS.ProcessEnv },
) => ChildProcessWithoutNullStreams;

export interface CodexAppServerOptions {
  codexPath?: string;
  spawnFn?: SpawnCodexAppServerFn;
  env?: NodeJS.ProcessEnv;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export interface CodexAppServerConnection {
  process: ChildProcessWithoutNullStreams;
  client: CodexJsonRpcClient;
  dispose: () => void;
}

export function startCodexAppServer({
  codexPath = 'codex',
  spawnFn = spawn,
  env = process.env,
  onExit,
}: CodexAppServerOptions = {}): CodexAppServerConnection {
  const child = spawnFn(codexPath, ['app-server', '--listen', 'stdio://'], {
    stdio: 'pipe',
    env,
  });
  const client = new CodexJsonRpcClient({
    input: child.stdout,
    output: child.stdin,
  });
  child.once('exit', (code, signal) => {
    client.dispose();
    onExit?.(code, signal);
  });

  return {
    process: child,
    client,
    dispose: () => {
      client.dispose();
      if (!child.killed) child.kill();
    },
  };
}
