import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildManualPlanImageTable,
  buildManualPlanImageSvg,
  createManualPlanImage,
  downloadManualPlanImage,
  manualPlanImageFilename,
  normalizeManualPlanImageMemberIndices,
} from '../create-manual-plan-image';

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

function sourceTable(): HTMLTableElement {
  const table = document.createElement('table');
  table.innerHTML = `
    <colgroup><col class="manual-plan-table__date-column" />${Array.from(
      { length: 9 },
      (_, index) => `<col class="manual-plan-table__value-column${index % 3 === 0 ? ' manual-plan-table__value-column--field-pvp' : ''}" />`,
    ).join('')}<col class="manual-plan-table__date-column" /></colgroup>
    <thead>
      <tr><th class="manual-plan-table__date-heading">ID</th><th class="manual-plan-table__member-heading manual-plan-table__member-heading--left sheet-marker--green-2" colspan="3"><strong>고규식</strong><span>1001</span></th><th class="manual-plan-table__member-heading manual-plan-table__member-heading--root sheet-marker--pink-1" colspan="3"><strong>베로니카</strong><span>1002</span></th><th class="manual-plan-table__member-heading manual-plan-table__member-heading--right sheet-marker--purple-4" colspan="3"><strong>김정미</strong><span>1003</span></th><th class="manual-plan-table__date-heading manual-plan-table__date-heading--end">ID</th></tr>
      <tr><th class="manual-plan-table__date-heading">목표값</th><th class="manual-plan-table__target-heading manual-plan-table__target-heading--left"><strong>700</strong></th><th class="manual-plan-table__target-heading manual-plan-table__target-heading--left"><strong>2,500</strong></th><th class="manual-plan-table__target-heading manual-plan-table__target-heading--left"><strong>1,800</strong></th><th>700</th><th>5,000</th><th>5,000</th><th>700</th><th>2,500</th><th>1,800</th><th>목표값</th></tr>
      <tr><th class="manual-plan-table__date-heading">잔액</th><th class="manual-plan-table__achievement-heading manual-plan-table__achievement-heading--left"><strong>+700</strong></th><th class="manual-plan-table__achievement-heading manual-plan-table__achievement-heading--left"><strong>+2,500</strong></th><th class="manual-plan-table__achievement-heading manual-plan-table__achievement-heading--left"><strong>+1,800</strong></th><th>+700</th><th>+5,000</th><th>+5,000</th><th>+700</th><th>+2,500</th><th>+1,800</th><th>잔액</th></tr>
      <tr><th class="manual-plan-table__date-heading">날짜</th><th class="manual-plan-table__column-heading manual-plan-table__column-heading--left"><span>PVP</span><small>0</small></th><th class="manual-plan-table__column-heading manual-plan-table__column-heading--left"><span>좌</span><small>0</small></th><th class="manual-plan-table__column-heading manual-plan-table__column-heading--left"><span>우</span><small>0</small></th><th>PVP</th><th>좌</th><th>우</th><th>PVP</th><th>좌</th><th>우</th><th>날짜</th></tr>
    </thead>
    <tbody>
      <tr><th class="manual-plan-table__date-cell"><span>1 (토)</span></th><td class="manual-plan-cell manual-plan-cell--selected manual-plan-cell--member-left" data-commission-level="700" data-actual-difference="true"><input value="고1" /></td><td class="manual-plan-cell manual-plan-cell--member-left" data-reminder="true">고2</td><td class="manual-plan-cell manual-plan-cell--member-left">고3</td><td>베1</td><td>베2</td><td>베3</td><td>김1</td><td>김2</td><td>김3</td><th>1일 끝</th></tr>
    </tbody>
    <tfoot>
      <tr><th class="manual-plan-table__date-cell"><span>합계</span></th><td class="manual-plan-table__total-cell manual-plan-table__total-cell--left"><strong>10</strong></td><td class="manual-plan-table__total-cell manual-plan-table__total-cell--left"><strong>20</strong></td><td class="manual-plan-table__total-cell manual-plan-table__total-cell--left"><strong>30</strong></td><td>40</td><td>50</td><td>60</td><td>70</td><td>80</td><td>90</td><th>합계 끝</th></tr>
    </tfoot>
  `;
  return table;
}

function installCanvas(options: { readonly blob?: Blob | null; readonly context?: boolean } = {}) {
  const context = {
    scale: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    options.context === false ? null : context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(options.blob === undefined ? new Blob(['png'], { type: 'image/png' }) : options.blob);
  });
  return context;
}

function installImage(
  result: 'load' | 'error' = 'load',
  onSource?: (source: string) => void,
): void {
  class TestImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(value: string) {
      onSource?.(value);
      queueMicrotask(() => {
        if (result === 'load') this.onload?.();
        else this.onerror?.();
      });
    }
  }
  vi.stubGlobal('Image', TestImage);
}

function mountWorkspaceTable(): HTMLTableElement {
  const workspace = document.createElement('div');
  workspace.id = 'manual-plan-workspace';
  const stickyHeader = document.createElement('div');
  stickyHeader.className = 'manual-plan-sticky-header';
  const stickyTable = sourceTable();
  stickyTable.className = 'manual-plan-table manual-plan-table--sticky';
  stickyTable.querySelector('tbody')?.remove();
  stickyTable.querySelector('tfoot')?.remove();
  stickyHeader.append(stickyTable);
  const scroll = document.createElement('div');
  scroll.className = 'manual-plan-scroll';
  const table = sourceTable();
  table.className = 'manual-plan-table';
  scroll.append(table);
  workspace.append(stickyHeader, scroll);
  document.body.append(workspace);
  return table;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (originalCreateObjectUrl === undefined) Reflect.deleteProperty(URL, 'createObjectURL');
  else Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
  if (originalRevokeObjectUrl === undefined) Reflect.deleteProperty(URL, 'revokeObjectURL');
  else Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
});

describe('manual plan image table', () => {
  it('keeps the left date column and selected members in worksheet order', () => {
    const table = buildManualPlanImageTable(sourceTable(), [2, 0, 2]);

    expect(
      Array.from(table.tHead!.rows[0]!.cells).map((cell) => cell.textContent),
    ).toEqual(['ID', '고규식1001', '김정미1003']);
    expect(
      Array.from(table.tBodies[0]!.rows[0]!.cells).map((cell) => cell.textContent),
    ).toEqual(['1 (토)', '', '고2', '고3', '김1', '김2', '김3']);
    expect(table.querySelectorAll('col')).toHaveLength(7);
    expect(table.style.width).toBe('386px');
    expect(table.querySelector('input')?.value).toBe('고1');
    expect(table.querySelector('.manual-plan-cell--selected')).toBeNull();
  });

  it('builds a fixed export SVG without browser HTML rendering', () => {
    const table = buildManualPlanImageTable(sourceTable(), [0]);

    const image = buildManualPlanImageSvg(table);

    expect(image.width).toBe(218);
    expect(image.height).toBe(237);
    expect(image.markup).toContain('고규식');
    expect(image.markup).toContain('고1');
    expect(image.markup).toContain('합계');
    expect(image.markup).toContain('#91d6ab');
    expect(image.markup).toContain('#a62b22');
    expect(image.markup).toContain('#7b4db0');
    expect(image.markup).not.toContain('stroke-dasharray');
    expect(image.markup).not.toContain('foreignObject');
  });

  it('removes invalid and duplicate indices and keeps every valid member in worksheet order', () => {
    expect(
      normalizeManualPlanImageMemberIndices([5, -1, 3, 1, 0, 4, 2, 1], 6),
    ).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('rejects an empty selection and a missing worksheet', async () => {
    expect(() => buildManualPlanImageTable(sourceTable(), [])).toThrow(
      '이미지로 만들 회원을 한 명 이상 골라 주세요.',
    );
    await expect(
      createManualPlanImage({ memberIndices: [0] }),
    ).rejects.toThrow('계획표를 찾지 못했습니다.');
  });

  it('renders the full worksheet without the project title as a PNG blob', async () => {
    mountWorkspaceTable();
    const context = installCanvas();
    let imageSource = '';
    installImage('load', (source) => {
      imageSource = source;
    });

    const blob = await createManualPlanImage({ memberIndices: [0] });

    expect(blob.type).toBe('image/png');
    expect(decodeURIComponent(imageSource)).toContain('합계');
    expect(decodeURIComponent(imageSource)).toContain('고규식');
    expect(decodeURIComponent(imageSource)).not.toContain('foreignObject');
    expect(decodeURIComponent(imageSource)).not.toContain('202608A 민경욱');
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(context.fillRect).toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalled();
    expect(document.querySelector('body > div[style*="-10000px"]')).toBeNull();
  });

  it('reports unsupported canvas, image loading, and PNG encoding failures', async () => {
    mountWorkspaceTable();
    installCanvas({ context: false });
    installImage();
    await expect(
      createManualPlanImage({ memberIndices: [0] }),
    ).rejects.toThrow('계획표 이미지를 만들 수 없는 브라우저입니다.');

    vi.restoreAllMocks();
    installCanvas();
    installImage('error');
    await expect(
      createManualPlanImage({ memberIndices: [0] }),
    ).rejects.toThrow('계획표 이미지를 그리지 못했습니다.');

    vi.restoreAllMocks();
    installCanvas({ blob: null });
    installImage();
    await expect(
      createManualPlanImage({ memberIndices: [0] }),
    ).rejects.toThrow('계획표 이미지를 저장할 수 없습니다.');
  }, 15_000);

  it('builds a safe filename and starts a browser download', () => {
    expect(manualPlanImageFilename('2026/08:A', ['고규식', '김정미']))
      .toBe('2026-08-A_고규식-김정미.png');
    expect(manualPlanImageFilename('  ', [])).toBe('계획표.png');

    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:download');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadManualPlanImage(new Blob(['png']), '계획표.png');
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a')).toBeNull();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });
});
