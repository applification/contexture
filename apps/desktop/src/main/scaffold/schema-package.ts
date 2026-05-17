/**
 * `scaffoldSchemaPackage` (stage 6) — lays down the `packages/contexture/`
 * tree: initial IR, generated bundle, workspace package.json, .gitignore,
 * and the .contexture/ marker with layout/chat sidecars. Pure file
 * generation against an injected FsAdapter; generated artefacts go
 * through the same shared writer used by desktop saves, CLI, and MCP.
 */

import { IRSchema, type Schema, writeGeneratedBundle } from '@contexture/core';
import type { FsAdapter } from '@main/documents/document-store';

import type { ScaffoldConfig } from './scaffold-project';

export interface SchemaPackageDeps {
  fs: FsAdapter;
}

const EMPTY_SCHEMA: Schema = { version: '1', types: [] };

function makeChatHistory(description?: string): string {
  const messages = description?.trim()
    ? [
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: description.trim(),
          createdAt: Date.now(),
        },
      ]
    : [];
  return `${JSON.stringify({ version: '1', messages }, null, 2)}\n`;
}

function makePackageJson(projectName: string): string {
  return `${JSON.stringify(
    {
      name: `@${projectName}/contexture`,
      version: '0.0.0',
      private: true,
      type: 'module',
      main: './index.ts',
      types: './index.ts',
      dependencies: { convex: 'latest' },
    },
    null,
    2,
  )}\n`;
}

const GITIGNORE = ['node_modules', 'dist', ''].join('\n');

export async function scaffoldSchemaPackage(
  config: ScaffoldConfig,
  deps: SchemaPackageDeps,
): Promise<void> {
  const { fs } = deps;
  const schemaDir = `${config.targetDir}/packages/contexture`;
  const irPath = `${schemaDir}/${config.projectName}.contexture.json`;
  const pkgPath = `${schemaDir}/package.json`;
  const gitignorePath = `${schemaDir}/.gitignore`;
  const ctxDir = `${schemaDir}/.contexture`;

  // When promoting a scratch file, use its IR content instead of the empty schema.
  let ir: Schema = EMPTY_SCHEMA;
  if (config.scratchPath) {
    const raw = await fs.readFile(config.scratchPath);
    ir = IRSchema.parse(JSON.parse(raw));
  }

  await writeGeneratedBundle({
    irPath,
    schema: ir,
    fs,
    driftPreflight: false,
    sidecars: [
      {
        path: `${ctxDir}/layout.json`,
        content: `${JSON.stringify({ version: '1', positions: {} }, null, 2)}\n`,
      },
      { path: `${ctxDir}/chat.json`, content: makeChatHistory(config.description) },
    ],
  });
  await fs.writeFile(pkgPath, makePackageJson(config.projectName));
  await fs.writeFile(gitignorePath, GITIGNORE);
}
