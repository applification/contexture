import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const bannedTokens = ['biome-ignore', 'eslint-disable'] as const;
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

type BannedToken = (typeof bannedTokens)[number];

type Finding = {
  file: string;
  line: number;
  column: number;
  token: BannedToken;
  text: string;
};

function extensionOf(path: string): string {
  const index = path.lastIndexOf('.');
  return index === -1 ? '' : path.slice(index);
}

async function* sourceFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        yield* sourceFiles(path);
      }
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(extensionOf(entry.name))) {
      yield path;
    }
  }
}

function lineStartsFor(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function positionFor(index: number, lineStarts: number[]): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const lineIndex = Math.max(0, high);
  return {
    line: lineIndex + 1,
    column: index - lineStarts[lineIndex] + 1,
  };
}

function lineTextFor(index: number, source: string, lineStarts: number[]): string {
  const { line } = positionFor(index, lineStarts);
  const start = lineStarts[line - 1];
  const nextStart = lineStarts[line] ?? source.length + 1;
  return source.slice(start, nextStart).trimEnd();
}

function findBannedTokensInComment(
  file: string,
  source: string,
  lineStarts: number[],
  start: number,
  end: number,
): Finding[] {
  const findings: Finding[] = [];
  const comment = source.slice(start, end);
  for (const token of bannedTokens) {
    let offset = comment.indexOf(token);
    while (offset !== -1) {
      const index = start + offset;
      const { line, column } = positionFor(index, lineStarts);
      findings.push({
        file,
        line,
        column,
        token,
        text: lineTextFor(index, source, lineStarts),
      });
      offset = comment.indexOf(token, offset + token.length);
    }
  }
  return findings;
}

function scanFile(file: string, source: string): Finding[] {
  const lineStarts = lineStartsFor(source);
  const findings: Finding[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"' || char === "'") {
      const quote = char;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
        } else if (source[i] === quote) {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    if (char === '`') {
      i++;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
        } else if (source[i] === '`') {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    if (char === '/' && next === '/') {
      const start = i;
      i += 2;
      while (i < source.length && source[i] !== '\n') i++;
      findings.push(...findBannedTokensInComment(file, source, lineStarts, start, i));
      continue;
    }

    if (char === '/' && next === '*') {
      const start = i;
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      const end = i < source.length ? i + 2 : i;
      findings.push(...findBannedTokensInComment(file, source, lineStarts, start, end));
      i = end;
      continue;
    }

    i++;
  }
  return findings;
}

const root = process.argv[2] ?? process.cwd();
const findings: Finding[] = [];

for await (const file of sourceFiles(root)) {
  const source = await readFile(file, 'utf8');
  findings.push(...scanFile(relative(root, file), source));
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);

if (findings.length > 0) {
  console.error('Lint suppression comments are banned. Fix the underlying lint issue instead.\n');
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}:${finding.column} ${finding.token}`);
    console.error(`  ${finding.text.trim()}`);
  }
  process.exit(1);
}

console.log('No banned lint suppression comments found.');
