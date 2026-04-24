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
import type { Schema } from '@renderer/model/ir';

import type { ScaffoldConfig } from './scaffold-project';

export interface SchemaPackageDeps {
  fs: FsAdapter;
}

const EMPTY_SCHEMA: Schema = { version: '1', types: [] };

function makePackageJson(projectName: string): string {
  return `${JSON.stringify(
    {
      name: `@${projectName}/schema`,
      version: '0.0.0',
      private: true,
      type: 'module',
      main: './index.ts',
      types: './index.ts',
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

  await fs.writeFile(irPath, `${JSON.stringify(EMPTY_SCHEMA, null, 2)}\n`);
  await fs.writeFile(schemaTsPath, emitZod(EMPTY_SCHEMA, irPath));
  await fs.writeFile(schemaJsonPath, `${JSON.stringify(emitJsonSchema(EMPTY_SCHEMA), null, 2)}\n`);
  await fs.writeFile(indexPath, emitSchemaIndex(config.projectName));
  await fs.writeFile(pkgPath, makePackageJson(config.projectName));
  await fs.writeFile(gitignorePath, GITIGNORE);
  await fs.writeFile(
    `${ctxDir}/layout.json`,
    `${JSON.stringify({ version: '1', positions: {} }, null, 2)}\n`,
  );
  await fs.writeFile(
    `${ctxDir}/chat.json`,
    `${JSON.stringify({ version: '1', messages: [] }, null, 2)}\n`,
  );
  await fs.writeFile(
    `${ctxDir}/emitted.json`,
    `${JSON.stringify({ version: '1', files: {} }, null, 2)}\n`,
  );
}
