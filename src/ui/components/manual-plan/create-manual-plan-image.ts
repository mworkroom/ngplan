const DATE_COLUMN_WIDTH_PX = 50;
const MEMBER_COLUMN_WIDTH_PX = 168;
const MEMBER_FIELD_WIDTHS_PX = [60, 54, 54] as const;
const HEADER_ROW_HEIGHTS_PX = [58, 30, 30, 42] as const;
const BODY_ROW_HEIGHT_PX = 38;
const TOTAL_ROW_HEIGHT_PX = 38;
const IMAGE_SCALE = 2;

const EXPORT_COLORS = {
  text: '#171717',
  muted: '#616b74',
  line: '#c9d2dc',
  danger: '#a62b22',
  dangerSoft: '#fff1ef',
  success: '#1f7a45',
  panel: '#ffffff',
  header: '#f2f4f6',
  dateHeader: '#e9edf0',
  dateCell: '#f6f7f8',
  skipped: '#f6f7f9',
  left: '#f5fbfd',
  root: '#f6f7f8',
  right: '#f8f7fd',
  totalLeft: '#edf8fb',
  totalRoot: '#eceff1',
  totalRight: '#f1f0fb',
  markerPink: '#f4cccc',
  markerGreen: '#d9ead3',
  markerBlue: '#cfe2f3',
  markerPurple: '#e4d7f5',
  commission300: '#f4d978',
  commission700: '#91d6ab',
  commission1500: '#8dbfe8',
  commission2400: '#e9a6bf',
} as const;

export function normalizeManualPlanImageMemberIndices(
  indices: readonly number[],
  memberCount: number,
): readonly number[] {
  return [...new Set(indices)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < memberCount)
    .sort((left, right) => left - right);
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

interface SvgTextLine {
  readonly text: string;
  readonly fontSize: number;
  readonly fontWeight: 500 | 600 | 700 | 800;
  readonly color: string;
}

export interface ManualPlanImageSvg {
  readonly markup: string;
  readonly width: number;
  readonly height: number;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function trimmedText(element: Element | null): string {
  return element?.textContent?.trim() ?? '';
}

function cellTextLines(cell: HTMLTableCellElement): readonly SvgTextLine[] {
  const input = cell.querySelector<HTMLInputElement>('input');
  if (input !== null) {
    return input.value === ''
      ? []
      : [{ text: input.value, fontSize: 13, fontWeight: 500, color: EXPORT_COLORS.text }];
  }

  if (cell.classList.contains('manual-plan-table__member-heading')) {
    const lines: SvgTextLine[] = [
      {
        text: trimmedText(cell.querySelector('strong')),
        fontSize: 12,
        fontWeight: 800,
        color: EXPORT_COLORS.text,
      },
      {
        text: trimmedText(cell.querySelector('span')),
        fontSize: 10,
        fontWeight: 500,
        color: EXPORT_COLORS.muted,
      },
    ];
    return lines.filter((line) => line.text !== '');
  }

  if (cell.classList.contains('manual-plan-table__column-heading')) {
    const lines: SvgTextLine[] = [
      {
        text: trimmedText(cell.querySelector('span')),
        fontSize: 11,
        fontWeight: 800,
        color: EXPORT_COLORS.text,
      },
      {
        text: trimmedText(cell.querySelector('small')),
        fontSize: 9,
        fontWeight: 600,
        color: EXPORT_COLORS.muted,
      },
    ];
    return lines.filter((line) => line.text !== '');
  }

  const primary =
    cell.querySelector<HTMLElement>('.manual-plan-cell__aggregate > span')
    ?? cell.querySelector<HTMLElement>('.manual-plan-cell__locked > span')
    ?? cell.querySelector<HTMLElement>(':scope > strong')
    ?? cell.querySelector<HTMLElement>(':scope > span');
  const text = trimmedText(primary) || trimmedText(cell);
  if (text === '') {
    return [];
  }
  const muted = cell.classList.contains('manual-plan-table__target-heading')
    || cell.classList.contains('manual-plan-table__achievement-heading');
  const met = cell.querySelector('.manual-plan-table__achievement-value--met') !== null;
  return [{
    text,
    fontSize: cell.classList.contains('manual-plan-table__date-cell') ? 11 : 12,
    fontWeight: cell.tagName === 'TH' || cell.closest('tfoot') !== null ? 700 : 500,
    color: met ? EXPORT_COLORS.success : muted ? EXPORT_COLORS.muted : EXPORT_COLORS.text,
  }];
}

function cellBackground(cell: HTMLTableCellElement): string {
  if (cell.classList.contains('sheet-marker--pink-1')) return EXPORT_COLORS.markerPink;
  if (cell.classList.contains('sheet-marker--green-2')) return EXPORT_COLORS.markerGreen;
  if (cell.classList.contains('sheet-marker--blue-3')) return EXPORT_COLORS.markerBlue;
  if (cell.classList.contains('sheet-marker--purple-4')) return EXPORT_COLORS.markerPurple;
  if (cell.classList.contains('manual-plan-cell--error')) return EXPORT_COLORS.dangerSoft;
  if (cell.classList.contains('manual-plan-table__date-heading')) return EXPORT_COLORS.dateHeader;
  if (cell.classList.contains('manual-plan-table__date-cell')) return EXPORT_COLORS.dateCell;
  if (cell.closest('.manual-plan-table__skipped-row') !== null) return EXPORT_COLORS.skipped;
  if (cell.classList.contains('manual-plan-table__total-cell--left')) return EXPORT_COLORS.totalLeft;
  if (cell.classList.contains('manual-plan-table__total-cell--root')) return EXPORT_COLORS.totalRoot;
  if (cell.classList.contains('manual-plan-table__total-cell--right')) return EXPORT_COLORS.totalRight;
  if (Array.from(cell.classList).some((name) => name.endsWith('--left'))) return EXPORT_COLORS.left;
  if (Array.from(cell.classList).some((name) => name.endsWith('--root'))) return EXPORT_COLORS.root;
  if (Array.from(cell.classList).some((name) => name.endsWith('--right'))) return EXPORT_COLORS.right;
  if (cell.closest('thead') !== null) return EXPORT_COLORS.header;
  return EXPORT_COLORS.panel;
}

function commissionColor(cell: HTMLTableCellElement): string | null {
  switch (cell.dataset.commissionLevel) {
    case '300': return EXPORT_COLORS.commission300;
    case '700': return EXPORT_COLORS.commission700;
    case '1500': return EXPORT_COLORS.commission1500;
    case '2400': return EXPORT_COLORS.commission2400;
    default: return null;
  }
}

function rowHeight(row: HTMLTableRowElement): number {
  const section = row.parentElement;
  if (section instanceof HTMLTableSectionElement && section.tagName === 'THEAD') {
    return HEADER_ROW_HEIGHTS_PX[row.sectionRowIndex] ?? BODY_ROW_HEIGHT_PX;
  }
  if (section instanceof HTMLTableSectionElement && section.tagName === 'TFOOT') {
    return TOTAL_ROW_HEIGHT_PX;
  }
  return BODY_ROW_HEIGHT_PX;
}

function svgText(
  cell: HTMLTableCellElement,
  lines: readonly SvgTextLine[],
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  if (lines.length === 0) return '';
  const rightAligned = cell.querySelector('input') !== null
    || cell.classList.contains('manual-plan-cell')
    || cell.classList.contains('manual-plan-table__target-heading')
    || cell.classList.contains('manual-plan-table__achievement-heading')
    || cell.classList.contains('manual-plan-table__total-cell');
  const leftAligned = cell.classList.contains('manual-plan-table__date-cell');
  const anchor = rightAligned ? 'end' : leftAligned ? 'start' : 'middle';
  const textX = rightAligned ? x + width - 7 : leftAligned ? x + 8 : x + width / 2;
  const gap = 3;
  const textHeight = lines.reduce((total, line) => total + line.fontSize, 0)
    + gap * Math.max(0, lines.length - 1);
  let baseline = y + (height - textHeight) / 2;
  return lines.map((line) => {
    baseline += line.fontSize * 0.82;
    const result = `<text x="${textX}" y="${baseline}" text-anchor="${anchor}" font-size="${line.fontSize}" font-weight="${line.fontWeight}" fill="${line.color}">${escapeXml(line.text)}</text>`;
    baseline += line.fontSize * 0.18 + gap;
    return result;
  }).join('');
}

export function buildManualPlanImageSvg(table: HTMLTableElement): ManualPlanImageSvg {
  const memberCount = Math.max(0, (table.tHead?.rows[0]?.cells.length ?? 1) - 1);
  const columnWidths = [
    DATE_COLUMN_WIDTH_PX,
    ...Array.from({ length: memberCount }, () => MEMBER_FIELD_WIDTHS_PX).flat(),
  ];
  const width = DATE_COLUMN_WIDTH_PX + memberCount * MEMBER_COLUMN_WIDTH_PX;
  const rows = Array.from(table.rows);
  const height = rows.reduce((total, row) => total + rowHeight(row), 0) + 1;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<g font-family="'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif">`,
  ];
  let y = 0;
  rows.forEach((row) => {
    const heightForRow = rowHeight(row);
    let columnIndex = 0;
    Array.from(row.cells).forEach((cell) => {
      const span = Math.max(1, cell.colSpan);
      const x = columnWidths.slice(0, columnIndex).reduce((sum, value) => sum + value, 0);
      const cellWidth = columnWidths
        .slice(columnIndex, columnIndex + span)
        .reduce((sum, value) => sum + value, 0);
      parts.push(
        `<rect x="${x}" y="${y}" width="${cellWidth}" height="${heightForRow}" fill="${cellBackground(cell)}" stroke="${EXPORT_COLORS.line}" stroke-width="1"/>`,
      );
      if (columnIndex > 0 && (columnIndex - 1) % 3 === 0) {
        parts.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y + heightForRow}" stroke="${EXPORT_COLORS.line}" stroke-width="2"/>`);
      }
      if (columnIndex > 0 && (columnIndex + span - 2) % 3 === 2) {
        parts.push(`<line x1="${x + cellWidth}" y1="${y}" x2="${x + cellWidth}" y2="${y + heightForRow}" stroke="${EXPORT_COLORS.line}" stroke-width="2"/>`);
      }
      const marker = commissionColor(cell);
      if (marker !== null) {
        parts.push(`<rect x="${x + 2}" y="${y + 3}" width="4" height="${Math.max(0, heightForRow - 6)}" rx="1" fill="${marker}"/>`);
      }
      parts.push(svgText(cell, cellTextLines(cell), x, y, cellWidth, heightForRow));
      if (cell.dataset.actualDifference === 'true') {
        parts.push(
          `<line x1="${x}" y1="${y + 2}" x2="${x + cellWidth}" y2="${y + 2}" stroke="${EXPORT_COLORS.danger}" stroke-width="4"/>`,
          `<line x1="${x}" y1="${y + heightForRow - 2}" x2="${x + cellWidth}" y2="${y + heightForRow - 2}" stroke="${EXPORT_COLORS.danger}" stroke-width="4"/>`,
        );
      }
      columnIndex += span;
    });
    y += heightForRow;
  });
  parts.push('</g></svg>');
  return { markup: parts.join(''), width, height };
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
  readonly memberIndices: readonly number[];
}

export async function createManualPlanImage({
  memberIndices,
}: CreateManualPlanImageOptions): Promise<Blob> {
  const sourceTable = document.querySelector<HTMLTableElement>(
    '#manual-plan-workspace .manual-plan-scroll > .manual-plan-table:not(.manual-plan-table--sticky)',
  );
  if (sourceTable === null) {
    throw new Error('계획표를 찾지 못했습니다. 화면을 다시 열어 주세요.');
  }

  const table = buildManualPlanImageTable(sourceTable, memberIndices);
  const svg = buildManualPlanImageSvg(table);
  await document.fonts?.ready;
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.markup)}`;
  const image = await loadSvgImage(svgUrl);
  const canvas = document.createElement('canvas');
  canvas.width = svg.width * IMAGE_SCALE;
  canvas.height = svg.height * IMAGE_SCALE;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('계획표 이미지를 만들 수 없는 브라우저입니다.');
  }
  context.scale(IMAGE_SCALE, IMAGE_SCALE);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, svg.width, svg.height);
  context.drawImage(image, 0, 0, svg.width, svg.height);
  return await canvasToPngBlob(canvas);
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
