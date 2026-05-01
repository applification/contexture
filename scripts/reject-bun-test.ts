console.error(
  "\nThis repo uses Vitest, not Bun's test runner.\n" +
    'Run `bun run test` (workspace script) or `bunx vitest run <path>` instead of `bun test`.\n',
);
process.kill(process.pid, 'SIGTERM');
