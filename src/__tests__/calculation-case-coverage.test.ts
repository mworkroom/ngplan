import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

interface DocumentedCalculationCase {
  readonly id: string;
  readonly status: '확정' | '설계 계약';
  readonly target: string;
}

const currentTestFile = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(currentTestFile), '..', '..');
const calculationCasesDocument = join(
  projectRoot,
  'docs',
  'CALCULATION_CASES.md',
);
const sourceRoot = join(projectRoot, 'src');

function parsePhaseOneCalculationCases(
  markdown: string,
): readonly DocumentedCalculationCase[] {
  const sections = markdown.split(/^###\s+/mu).slice(1);
  const cases: DocumentedCalculationCase[] = [];

  for (const section of sections) {
    const heading = section.split(/\r?\n/u, 1)[0];
    if (heading === undefined) {
      continue;
    }

    const idMatch = /^([A-Z]+-[A-Z0-9]+)\s+—/u.exec(heading);
    const metadataMatch =
      /^\*\*상태:\*\*\s*(확정|설계 계약)\s*·\s*\*\*대상:\*\*\s*(.+?)[ \t]*\r?$/mu.exec(
        section,
      );
    const id = idMatch?.[1];
    const status = metadataMatch?.[1];
    const target = metadataMatch?.[2]?.trim();

    if (
      id === undefined ||
      (status !== '확정' && status !== '설계 계약') ||
      target === undefined ||
      !/\bPhase 1\b/u.test(target)
    ) {
      continue;
    }

    cases.push({ id, status, target });
  }

  return cases;
}

async function findTestFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findTestFiles(path)));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.test.ts') &&
      resolve(path) !== resolve(currentTestFile)
    ) {
      files.push(path);
    }
  }

  return files.sort();
}

describe('Phase 1 calculation-case traceability', () => {
  test('every documented Phase 1 case appears in another test file', async () => {
    const markdown = await readFile(calculationCasesDocument, 'utf8');
    const documentedCases = parsePhaseOneCalculationCases(markdown);
    const documentedIds = documentedCases.map(({ id }) => id);

    expect(documentedCases).toHaveLength(60);
    expect(new Set(documentedIds).size).toBe(documentedIds.length);

    const testFiles = await findTestFiles(sourceRoot);
    const testSources = await Promise.all(
      testFiles.map(async (path) => ({
        path,
        source: await readFile(path, 'utf8'),
      })),
    );
    const missingCases = documentedCases.filter(({ id }) =>
      testSources.every(({ source }) => !source.includes(`[${id}]`)),
    );

    expect(
      missingCases,
      [
        '다른 *.test.ts 파일에서 [ID] 표기를 찾지 못한 Phase 1 계산 사례:',
        ...missingCases.map(
          ({ id, status, target }) => `- ${id} (${status}, ${target})`,
        ),
        '',
        `검사한 테스트 파일 수: ${testFiles.length}`,
      ].join('\n'),
    ).toEqual([]);
  });
});
