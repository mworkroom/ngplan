export const MAX_MANUAL_PLAN_IMAGE_MEMBERS = 5;

const DATE_COLUMN_WIDTH_PX = 50;
const MEMBER_COLUMN_WIDTH_PX = 168;
const IMAGE_SCALE = 2;

export function normalizeManualPlanImageMemberIndices(
  indices: readonly number[],
  memberCount: number,
): readonly number[] {
  return [...new Set(indices)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < memberCount)
    .sort((left, right) => left - right)
    .slice(0, MAX_MANUAL_PLAN_IMAGE_MEMBERS);
}

function keepChildrenAtIndices(element: Element, indices: ReadonlySet<number>): void {
  Array.from(element.children).forEach((child, index) => {
    if (!indices.has(index)) {
      child.remove();
    }
  });
}

export function buildManualPlanImageTable(
  sourceTable: HTMLTableElement,
  requestedMemberIndices: readonly number[],
): HTMLTableElement {
  const memberCount = Math.max(
    0,
    (sourceTable.tHead?.rows[0]?.cells.length ?? 2) - 2,
  );
  const memberIndices = normalizeManualPlanImageMemberIndices(
    requestedMemberIndices,
    memberCount,
  );
  if (memberIndices.length === 0) {
    throw new Error('이미지로 만들 회원을 한 명 이상 골라 주세요.');
  }

  const clone = sourceTable.cloneNode(true) as HTMLTableElement;
  const sourceInputs = sourceTable.querySelectorAll<HTMLInputElement>('input');
  const cloneInputs = clone.querySelectorAll<HTMLInputElement>('input');
  sourceInputs.forEach((input, index) => {
    const cloneInput = cloneInputs[index];
    if (cloneInput !== undefined) {
      cloneInput.value = input.value;
      cloneInput.setAttribute('value', input.value);
      cloneInput.readOnly = true;
    }
  });

  const physicalColumnIndices = new Set<number>([0]);
  memberIndices.forEach((memberIndex) => {
    const firstColumnIndex = 1 + memberIndex * 3;
    physicalColumnIndices.add(firstColumnIndex);
    physicalColumnIndices.add(firstColumnIndex + 1);
    physicalColumnIndices.add(firstColumnIndex + 2);
  });
  const firstHeaderIndices = new Set<number>([
    0,
    ...memberIndices.map((memberIndex) => memberIndex + 1),
  ]);

  const colgroup = clone.querySelector('colgroup');
  if (colgroup !== null) {
    keepChildrenAtIndices(colgroup, physicalColumnIndices);
  }
  Array.from(clone.rows).forEach((row) => {
    keepChildrenAtIndices(
      row,
      row === clone.tHead?.rows[0] ? firstHeaderIndices : physicalColumnIndices,
    );
  });

  clone.querySelectorAll('.manual-plan-cell--selected').forEach((cell) => {
    cell.classList.remove('manual-plan-cell--selected');
  });
  const width = DATE_COLUMN_WIDTH_PX + memberIndices.length * MEMBER_COLUMN_WIDTH_PX;
  clone.style.width = `${width}px`;
  clone.style.minWidth = `${width}px`;
  return clone;
}

function addCellMarkers(root: HTMLElement): void {
  const theme = getComputedStyle(document.documentElement);
  const danger = theme.getPropertyValue('--color-danger').trim() || '#a62b22';
  const commissionColors: Readonly<Record<string, string>> = {
    '300': theme.getPropertyValue('--color-commission-300').trim() || '#f4d978',
    '700': theme.getPropertyValue('--color-commission-700').trim() || '#91d6ab',
    '1500': theme.getPropertyValue('--color-commission-1500').trim() || '#8dbfe8',
    '2400': theme.getPropertyValue('--color-commission-2400').trim() || '#e9a6bf',
  };

  root.querySelectorAll<HTMLElement>('[data-commission-level]').forEach((cell) => {
    const level = cell.dataset.commissionLevel;
    const color = level === undefined ? undefined : commissionColors[level];
    if (color === undefined) {
      return;
    }
    const marker = document.createElement('span');
    marker.setAttribute('aria-hidden', 'true');
    Object.assign(marker.style, {
      position: 'absolute',
      zIndex: '1',
      top: '3px',
      bottom: '3px',
      left: '2px',
      width: '4px',
      borderRadius: '1px',
      background: color,
      pointerEvents: 'none',
    });
    cell.append(marker);
  });

  root.querySelectorAll<HTMLElement>('[data-actual-difference="true"]').forEach((cell) => {
    const marker = document.createElement('span');
    marker.setAttribute('aria-hidden', 'true');
    Object.assign(marker.style, {
      position: 'absolute',
      zIndex: '2',
      inset: '0',
      borderTop: `4px solid ${danger}`,
      borderBottom: `4px solid ${danger}`,
      pointerEvents: 'none',
    });
    cell.append(marker);
  });
}

function inlineComputedStyles(root: HTMLElement): void {
  const exportedProperties = [
    'appearance',
    'background-color',
    'border-collapse',
    'border-spacing',
    'border-top-color',
    'border-top-style',
    'border-top-width',
    'border-right-color',
    'border-right-style',
    'border-right-width',
    'border-bottom-color',
    'border-bottom-style',
    'border-bottom-width',
    'border-left-color',
    'border-left-style',
    'border-left-width',
    'border-radius',
    'box-sizing',
    'color',
    'display',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'height',
    'letter-spacing',
    'line-height',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'max-width',
    'min-height',
    'min-width',
    'opacity',
    'overflow',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'position',
    'table-layout',
    'text-align',
    'text-decoration',
    'text-overflow',
    'text-transform',
    'vertical-align',
    'white-space',
    'width',
    'word-break',
  ] as const;
  const elements = [root, ...root.querySelectorAll<HTMLElement>('*')];
  elements.forEach((element) => {
    const computed = getComputedStyle(element);
    exportedProperties.forEach((property) => {
      element.style.setProperty(property, computed.getPropertyValue(property));
    });
  });
}

function loadSvgImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('계획표 이미지를 그리지 못했습니다.'));
    image.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('계획표 이미지를 저장할 수 없습니다.'));
      } else {
        resolve(blob);
      }
    }, 'image/png');
  });
}

export interface CreateManualPlanImageOptions {
  readonly projectTitle: string;
  readonly memberIndices: readonly number[];
}

export async function createManualPlanImage({
  projectTitle,
  memberIndices,
}: CreateManualPlanImageOptions): Promise<Blob> {
  const sourceTable = document.querySelector<HTMLTableElement>(
    '#manual-plan-workspace .manual-plan-table',
  );
  if (sourceTable === null) {
    throw new Error('계획표를 찾지 못했습니다. 화면을 다시 열어 주세요.');
  }

  const table = buildManualPlanImageTable(sourceTable, memberIndices);
  const tableWidth = Number.parseFloat(table.style.width);
  const host = document.createElement('div');
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: '-10000px',
    zIndex: '-1',
    pointerEvents: 'none',
  });
  const exportRoot = document.createElement('div');
  exportRoot.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  Object.assign(exportRoot.style, {
    boxSizing: 'border-box',
    width: `${tableWidth + 24}px`,
    padding: '12px',
    background: '#ffffff',
    color: '#171717',
    fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif',
  });
  const title = document.createElement('h1');
  title.textContent = projectTitle;
  Object.assign(title.style, {
    margin: '0 0 10px',
    fontSize: '20px',
    lineHeight: '1.35',
    fontWeight: '800',
  });
  exportRoot.append(title, table);
  host.append(exportRoot);
  document.body.append(host);

  try {
    await document.fonts?.ready;
    addCellMarkers(exportRoot);
    const rect = exportRoot.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    inlineComputedStyles(exportRoot);
    const markup = new XMLSerializer().serializeToString(exportRoot);
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<foreignObject width="100%" height="100%">${markup}</foreignObject>`,
      '</svg>',
    ].join('');
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const image = await loadSvgImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = width * IMAGE_SCALE;
    canvas.height = height * IMAGE_SCALE;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('계획표 이미지를 만들 수 없는 브라우저입니다.');
    }
    context.scale(IMAGE_SCALE, IMAGE_SCALE);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await canvasToPngBlob(canvas);
  } finally {
    host.remove();
  }
}

export function manualPlanImageFilename(
  projectTitle: string,
  memberNames: readonly string[],
): string {
  const raw = `${projectTitle}_${memberNames.join('-')}`;
  const safe = raw.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  const filename = safe.replace(/[-_\s]/g, '') === '' ? '계획표' : safe;
  return `${filename}.png`;
}

export function downloadManualPlanImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
