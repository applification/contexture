/**
 * Pure emitter for the generated schema barrel inside a Contexture bundle. It
 * lets app code import schemas from one stable module without caring which
 * sibling `.schema.ts` module a name lives in.
 *
 * With a single IR per project the output is trivial: one re-export from
 * the sibling `<base>.schema` module. When Contexture grows multi-IR
 * support the same function extends to emitting one `export *` per base.
 */

function header(sourcePath?: string): string {
  const base = '// @contexture-generated — do not edit by hand. Regenerated on every IR save.';
  return sourcePath ? `${base} Source: ${sourcePath}\n` : `${base}\n`;
}

export function emit(
  baseName: string,
  sourcePath?: string,
  schemaModule = `./${baseName}.schema`,
): string {
  return `${header(sourcePath)}export * from '${schemaModule}';\n`;
}
