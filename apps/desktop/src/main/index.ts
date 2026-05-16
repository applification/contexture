import { isMcpMode, startMcpServer } from './mcp-entrypoint';

if (isMcpMode(process.argv)) {
  void startMcpServer();
} else {
  void import('./app-main');
}
