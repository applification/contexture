export type RendererCspCommand = 'build' | 'serve';

const commonRendererCspDirectives = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "form-action 'none'",
];

export function rendererContentSecurityPolicy(command: RendererCspCommand): string {
  const commandSpecificDirectives =
    command === 'serve'
      ? ["script-src 'self' 'unsafe-inline'", "connect-src 'self' http: https: ws:"]
      : ["script-src 'self'", "connect-src 'self' https:"];

  return [...commonRendererCspDirectives, ...commandSpecificDirectives].join('; ');
}
