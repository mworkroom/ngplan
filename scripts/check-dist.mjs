import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_BASE = '/ngplan/';
const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDirectory = path.join(projectRoot, 'dist');
const indexPath = path.join(distDirectory, 'index.html');
const failures = [];

const recordFailure = (message) => {
  failures.push(message);
};

const isFile = async (filePath) => {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
};

if (!(await isFile(indexPath))) {
  recordFailure('dist/index.html이 없습니다. 먼저 프로덕션 빌드를 실행해야 합니다.');
}

const html = failures.length === 0 ? await readFile(indexPath, 'utf8') : '';
const references = Array.from(
  html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/giu),
  (match) => match[1],
).filter((reference) => reference !== undefined);

const localReferences = references.filter(
  (reference) =>
    !reference.startsWith('#') &&
    !reference.startsWith('data:') &&
    !reference.startsWith('http://') &&
    !reference.startsWith('https://') &&
    !reference.startsWith('mailto:') &&
    !reference.startsWith('tel:'),
);

if (localReferences.length === 0) {
  recordFailure('dist/index.html에서 로컬 빌드 자산을 찾지 못했습니다.');
}

for (const reference of localReferences) {
  if (!reference.startsWith(EXPECTED_BASE)) {
    recordFailure(`자산 경로가 ${EXPECTED_BASE}로 시작하지 않습니다: ${reference}`);
    continue;
  }

  const encodedPath = reference.slice(EXPECTED_BASE.length).split(/[?#]/u, 1)[0];

  if (encodedPath === undefined || encodedPath.length === 0) {
    recordFailure(`자산 경로가 파일을 가리키지 않습니다: ${reference}`);
    continue;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(encodedPath);
  } catch {
    recordFailure(`자산 경로를 디코딩할 수 없습니다: ${reference}`);
    continue;
  }

  const artifactPath = path.resolve(distDirectory, decodedPath);
  const relativePath = path.relative(distDirectory, artifactPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    recordFailure(`자산 경로가 dist 밖을 가리킵니다: ${reference}`);
    continue;
  }

  if (!(await isFile(artifactPath))) {
    recordFailure(`참조된 빌드 자산이 없습니다: ${reference}`);
  }
}

const assetReferences = localReferences.filter((reference) =>
  reference.startsWith(`${EXPECTED_BASE}assets/`),
);

if (!assetReferences.some((reference) => /\.js(?:[?#]|$)/u.test(reference))) {
  recordFailure('dist/index.html에서 /ngplan/assets/ JavaScript 자산을 찾지 못했습니다.');
}

if (!assetReferences.some((reference) => /\.css(?:[?#]|$)/u.test(reference))) {
  recordFailure('dist/index.html에서 /ngplan/assets/ CSS 자산을 찾지 못했습니다.');
}

if (/\b(?:src|href)\s*=\s*["']\/(?:src|assets)\//iu.test(html)) {
  recordFailure('배포 base를 우회하는 /src/ 또는 /assets/ 경로가 남아 있습니다.');
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `dist smoke check passed: ${assetReferences.length} referenced asset(s) under ${EXPECTED_BASE}`,
  );
}
