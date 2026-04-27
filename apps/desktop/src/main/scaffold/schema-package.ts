/**
 * `scaffoldSchemaPackage` (stage 6) — lays down the `packages/schema/`
 * tree: initial IR, Zod bundle + JSON mirror + barrel, workspace
 * package.json, .gitignore, and the .contexture/ marker with empty
 * layout/chat/emitted sidecars. Pure file generation against an
 * injected FsAdapter; reuses the existing emitters for the Zod + JSON
 * mirrors + barrel so the scaffolded tree matches what a subsequent
 * save would produce.
 */
import type { FsAdapter } from '@main/documents/document-store';
import { emit as emitJsonSchema } from '@renderer/model/emit-json-schema';
import { emit as emitSchemaIndex } from '@renderer/model/emit-schema-index';
import { emit as emitZod } from '@renderer/model/emit-zod';
import { IRSchema, type Schema } from '@renderer/model/ir';

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
      name: `@${projectName}/schema`,
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
  const schemaDir = `${config.targetDir}/packages/schema`;
  const irPath = `${schemaDir}/${config.projectName}.contexture.json`;
  const schemaTsPath = `${schemaDir}/${config.projectName}.schema.ts`;
  const schemaJsonPath = `${schemaDir}/${config.projectName}.schema.json`;
  const indexPath = `${schemaDir}/index.ts`;
  const pkgPath = `${schemaDir}/package.json`;
  const gitignorePath = `${schemaDir}/.gitignore`;
  const ctxDir = `${schemaDir}/.contexture`;

  // When promoting a scratch file, use its IR content instead of the empty schema.
  let ir: Schema = EMPTY_SCHEMA;
  if (config.scratchPath) {
    const raw = await fs.readFile(config.scratchPath);
    ir = IRSchema.parse(JSON.parse(raw));
  }

  await fs.writeFile(irPath, `${JSON.stringify(ir, null, 2)}\n`);
  await fs.writeFile(schemaTsPath, emitZod(ir, irPath));
  await fs.writeFile(schemaJsonPath, `${JSON.stringify(emitJsonSchema(ir), null, 2)}\n`);
  await fs.writeFile(indexPath, emitSchemaIndex(config.projectName));
  await fs.writeFile(pkgPath, makePackageJson(config.projectName));
  await fs.writeFile(gitignorePath, GITIGNORE);
  await fs.writeFile(
    `${ctxDir}/layout.json`,
    `${JSON.stringify({ version: '1', positions: {} }, null, 2)}\n`,
  );
  await fs.writeFile(`${ctxDir}/chat.json`, makeChatHistory(config.description));
  await fs.writeFile(
    `${ctxDir}/emitted.json`,
    `${JSON.stringify({ version: '1', files: {} }, null, 2)}\n`,
  );
}
