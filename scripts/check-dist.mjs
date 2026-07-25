import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_BASE = './';
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

const collectFiles = async (directory) => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
};

const toDistRelativePath = (filePath) =>
  path.relative(distDirectory, filePath).split(path.sep).join('/');

const hasModuleWorkerConstructor = (source, workerFileName) => {
  let matchAt = source.indexOf(workerFileName);
  while (matchAt !== -1) {
    const before = source.slice(Math.max(0, matchAt - 300), matchAt);
    const after = source.slice(matchAt, Math.min(source.length, matchAt + 300));
    if (
      /new\s+Worker\s*\(\s*new\s+URL\s*\(/u.test(before) &&
      /type\s*:\s*(?:["']module["']|`module`)/u.test(after)
    ) {
      return true;
    }
    matchAt = source.indexOf(workerFileName, matchAt + workerFileName.length);
  }
  return false;
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
  recordFailure('dist/index.html에서 ./assets/ JavaScript 자산을 찾지 못했습니다.');
}

if (!assetReferences.some((reference) => /\.css(?:[?#]|$)/u.test(reference))) {
  recordFailure('dist/index.html에서 ./assets/ CSS 자산을 찾지 못했습니다.');
}

if (/\b(?:src|href)\s*=\s*["']\/(?:src|assets)\//iu.test(html)) {
  recordFailure('배포 base를 우회하는 /src/ 또는 /assets/ 경로가 남아 있습니다.');
}

const distFiles = await collectFiles(distDirectory);
const javascriptArtifacts = distFiles.filter((filePath) => filePath.endsWith('.js'));
const workerArtifacts = javascriptArtifacts.filter((filePath) =>
  /^automatic-plan\.worker(?:-[A-Za-z0-9_-]+)?\.js$/u.test(path.basename(filePath)),
);
const appBundleArtifacts = javascriptArtifacts.filter(
  (filePath) => !workerArtifacts.includes(filePath),
);
const manifestArtifacts = distFiles.filter(
  (filePath) => path.basename(filePath) === 'manifest.json',
);

if (workerArtifacts.length === 0) {
  recordFailure('Phase 4 automatic-plan module worker 빌드 자산을 찾지 못했습니다.');
}

const appBundleSources = await Promise.all(
  appBundleArtifacts.map((filePath) => readFile(filePath, 'utf8')),
);
const manifestSources = await Promise.all(
  manifestArtifacts.map((filePath) => readFile(filePath, 'utf8')),
);
const verifiedWorkerArtifacts = [];

for (const workerPath of workerArtifacts) {
  const workerRelativePath = toDistRelativePath(workerPath);
  const workerFileName = path.basename(workerPath);
  const workerSource = await readFile(workerPath, 'utf8');
  if (workerSource.trim().length === 0) {
    recordFailure(`Phase 4 worker 빌드 자산이 비어 있습니다: ${workerRelativePath}`);
    continue;
  }

  const expectedBaseReference = `${EXPECTED_BASE}${workerRelativePath}`;
  const referencingBundles = appBundleSources.filter(
    (source) =>
      source.includes(expectedBaseReference) ||
      source.includes(workerRelativePath) ||
      source.includes(workerFileName),
  );
  const referencedByManifest = manifestSources.some(
    (source) =>
      source.includes(workerRelativePath) || source.includes(workerFileName),
  );

  if (referencingBundles.length === 0 && !referencedByManifest) {
    recordFailure(
      `Phase 4 worker가 app bundle 또는 manifest에서 참조되지 않습니다: ${workerRelativePath}`,
    );
    continue;
  }

  if (
    !referencingBundles.some((source) =>
      hasModuleWorkerConstructor(source, workerFileName),
    )
  ) {
    recordFailure(
      `Phase 4 worker의 { type: "module" } 생성 참조를 app bundle에서 찾지 못했습니다: ${workerRelativePath}`,
    );
    continue;
  }

  verifiedWorkerArtifacts.push(workerRelativePath);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `dist smoke check passed: ${assetReferences.length} referenced asset(s) under ${EXPECTED_BASE}; module worker ${verifiedWorkerArtifacts.join(', ')}`,
  );
}
