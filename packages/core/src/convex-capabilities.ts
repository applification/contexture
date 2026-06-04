import rootPackageJson from '../../../package.json' with { type: 'json' };

export const CONVEX_CAPABILITY_MANIFEST_VERSION = 1;
export const CONTEXTURE_SUPPORTED_CONVEX_VERSION = normalizeConvexPackageVersion(
  rootPackageJson.devDependencies.convex,
);

export interface ConvexCapabilityManifest {
  version: typeof CONVEX_CAPABILITY_MANIFEST_VERSION;
  packageVersion: string | null;
  cliVersion: string | null;
  validators: string[];
  serverExports: string[];
  cliCommands: string[];
  defineSchemaOptions: string[];
  generatedAt: string;
}

export interface ConvexCapabilityInput {
  packageVersion?: string | null;
  cliVersion?: string | null;
  validators?: Iterable<string>;
  serverExports?: Iterable<string>;
  cliHelp?: string | null;
  generatedAt?: string;
}

export function buildConvexCapabilityManifest(
  input: ConvexCapabilityInput,
): ConvexCapabilityManifest {
  return {
    version: CONVEX_CAPABILITY_MANIFEST_VERSION,
    packageVersion: input.packageVersion ?? CONTEXTURE_SUPPORTED_CONVEX_VERSION,
    cliVersion: input.cliVersion ?? null,
    validators: sortedUnique(input.validators ?? []),
    serverExports: sortedUnique(input.serverExports ?? []),
    cliCommands: parseConvexCliCommands(input.cliHelp ?? ''),
    defineSchemaOptions: ['schemaValidation', 'strictTableNameTypes'],
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}

export function parseConvexCliCommands(help: string): string[] {
  const commands = new Set<string>();
  let inCommands = false;
  for (const line of help.split(/\r?\n/u)) {
    if (line.trim() === 'Commands:') {
      inCommands = true;
      continue;
    }
    if (!inCommands) continue;
    const match = line.match(/^ {2}([a-z][a-z-]*)(?:[| ]|$)/u);
    if (match?.[1]) commands.add(match[1]);
  }
  return [...commands].sort();
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((value) => value.length > 0))].sort();
}

function normalizeConvexPackageVersion(version: string): string {
  return version
    .trim()
    .replace(/^npm:/u, '')
    .replace(/^convex@/u, '')
    .replace(/^[~^=<> ]+/u, '');
}
