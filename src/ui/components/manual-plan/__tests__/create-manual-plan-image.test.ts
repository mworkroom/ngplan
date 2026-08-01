import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildManualPlanImageTable,
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
    <colgroup>${Array.from({ length: 11 }, () => '<col />').join('')}</colgroup>
    <thead>
      <tr><th>날짜</th><th colspan="3">고규식</th><th colspan="3">베로니카</th><th colspan="3">김정미</th><th>끝 날짜</th></tr>
      <tr><th>날짜</th><th>고-P</th><th>고-좌</th><th>고-우</th><th>베-P</th><th>베-좌</th><th>베-우</th><th>김-P</th><th>김-좌</th><th>김-우</th><th>끝 날짜</th></tr>
    </thead>
    <tbody>
      <tr><th>1일</th><td class="manual-plan-cell--selected" data-commission-level="700" data-actual-difference="true"><input value="고1" /></td><td>고2</td><td>고3</td><td>베1</td><td>베2</td><td>베3</td><td>김1</td><td>김2</td><td>김3</td><th>1일 끝</th></tr>
    </tbody>
    <tfoot>
      <tr><th>합계</th><td>10</td><td>20</td><td>30</td><td>40</td><td>50</td><td>60</td><td>70</td><td>80</td><td>90</td><th>합계 끝</th></tr>
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
    ).toEqual(['날짜', '고규식', '김정미']);
    expect(
      Array.from(table.tBodies[0]!.rows[0]!.cells).map((cell) => cell.textContent),
    ).toEqual(['1일', '', '고2', '고3', '김1', '김2', '김3']);
    expect(table.querySelectorAll('col')).toHaveLength(7);
    expect(table.style.width).toBe('386px');
    expect(table.querySelector('input')?.value).toBe('고1');
    expect(table.querySelector('.manual-plan-cell--selected')).toBeNull();
  });

  it('keeps the worksheet row height after removing the compact screen zoom', () => {
    const workspace = document.createElement('div');
    workspace.dataset.density = 'compact';
    workspace.style.setProperty('zoom', '0.9');
    const source = sourceTable();
    workspace.append(source);
    document.body.append(workspace);
    Array.from(source.rows).forEach((row) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        height: 34.2,
      } as DOMRect);
    });

    const table = buildManualPlanImageTable(source, [0]);

    expect(Array.from(table.rows).map((row) => row.style.height))
      .toEqual(Array.from(table.rows, () => '38px'));
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
