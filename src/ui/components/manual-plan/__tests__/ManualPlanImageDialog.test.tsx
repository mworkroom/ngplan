import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualPlanImageDialog } from '../ManualPlanImageDialog';

const MEMBERS = [
  '민경욱',
  '고규식',
  '베로니카',
  '김정미',
  '박영희',
  '이순자',
].map((name, index) => ({
  memberKey: `member-${index}`,
  name,
  displayLabel: name,
}));

let originalCreateObjectUrl: PropertyDescriptor | undefined;
let originalRevokeObjectUrl: PropertyDescriptor | undefined;
let originalShare: PropertyDescriptor | undefined;
let originalCanShare: PropertyDescriptor | undefined;

beforeEach(() => {
  originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
  originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:manual-plan-preview'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalCreateObjectUrl === undefined) {
    Reflect.deleteProperty(URL, 'createObjectURL');
  } else {
    Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
  }
  if (originalRevokeObjectUrl === undefined) {
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  } else {
    Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
  }
  if (originalShare === undefined) Reflect.deleteProperty(navigator, 'share');
  else Object.defineProperty(navigator, 'share', originalShare);
  if (originalCanShare === undefined) Reflect.deleteProperty(navigator, 'canShare');
  else Object.defineProperty(navigator, 'canShare', originalCanShare);
});

describe('ManualPlanImageDialog', () => {
  it('creates the image with selected people in worksheet order, not click order', async () => {
    const user = userEvent.setup();
    const onCreateImage = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));
    render(
      <ManualPlanImageDialog
        projectTitle="202608A 민경욱"
        members={MEMBERS}
        onCreateImage={onCreateImage}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: '베로니카' }));
    await user.click(screen.getByRole('checkbox', { name: '민경욱' }));
    await user.click(
      screen.getByRole('button', { name: '선택한 2명 이미지 만들기' }),
    );

    await waitFor(() => expect(onCreateImage).toHaveBeenCalledWith([0, 2]));
    expect(
      screen.getByRole('img', { name: '선택한 2명의 계획표 이미지 미리보기' }),
    ).toBeDefined();
    expect(screen.getByText(/선택한 2명이 계획표 순서대로 들어갔습니다/))
      .toBeDefined();
  });

  it('allows all six people when needed', async () => {
    const user = userEvent.setup();
    const onCreateImage = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));
    render(
      <ManualPlanImageDialog
        projectTitle="202608A 민경욱"
        members={MEMBERS}
        onCreateImage={onCreateImage}
        onClose={vi.fn()}
      />,
    );

    for (const member of MEMBERS) {
      await user.click(screen.getByRole('checkbox', { name: member.name }));
    }

    expect(
      (screen.getByRole('checkbox', { name: '이순자' }) as HTMLInputElement).disabled,
    ).toBe(false);
    await user.click(
      screen.getByRole('button', { name: '선택한 6명 이미지 만들기' }),
    );
    await waitFor(() =>
      expect(onCreateImage).toHaveBeenCalledWith([0, 1, 2, 3, 4, 5]),
    );
  });

  it('shows creation errors and keeps cancellation unavailable while generating', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let rejectImage: ((reason: unknown) => void) | undefined;
    const onCreateImage = vi.fn(() => new Promise<Blob>((_resolve, reject) => {
      rejectImage = reject;
    }));
    const { container } = render(
      <ManualPlanImageDialog
        projectTitle="202608A 민경욱"
        members={MEMBERS}
        onCreateImage={onCreateImage}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: '민경욱' }));
    await user.click(screen.getByRole('button', { name: '선택한 1명 이미지 만들기' }));
    expect(screen.getByRole('button', { name: '이미지 만드는 중…' })).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(container.querySelector('.dialog-backdrop')!);
    expect(onClose).not.toHaveBeenCalled();

    rejectImage?.(new Error('이미지를 만들 수 없습니다.'));
    expect((await screen.findByRole('alert')).textContent).toContain(
      '이미지를 만들 수 없습니다.',
    );
    expect(screen.getByRole('button', { name: '선택한 1명 이미지 만들기' }))
      .toBeDefined();
  });

  it('supports retrying the selection, saving, Escape, and backdrop cancellation', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const { container } = render(
      <ManualPlanImageDialog
        projectTitle="202608A 민경욱"
        members={MEMBERS}
        onCreateImage={vi.fn(async () => new Blob(['png'], { type: 'image/png' }))}
        onClose={onClose}
      />,
    );

    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('checkbox', { name: '민경욱' }),
    ));
    await user.click(screen.getByRole('checkbox', { name: '민경욱' }));
    await user.click(screen.getByRole('button', { name: '선택한 1명 이미지 만들기' }));
    await user.click(await screen.findByRole('button', { name: '이미지 저장하기' }));
    expect(anchorClick).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '사람 다시 고르기' }));
    expect(screen.getByText('1명 선택했습니다.')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.mouseDown(container.querySelector('.dialog-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shares when supported and falls back to saving when sharing fails', async () => {
    const user = userEvent.setup();
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn(() => true),
    });
    render(
      <ManualPlanImageDialog
        projectTitle="202608A 민경욱"
        members={MEMBERS}
        onCreateImage={vi.fn(async () => new Blob(['png'], { type: 'image/png' }))}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: '고규식' }));
    await user.click(screen.getByRole('button', { name: '선택한 1명 이미지 만들기' }));
    const shareButton = await screen.findByRole('button', { name: '이미지 공유하기' });
    await user.click(shareButton);
    expect(share).toHaveBeenCalledOnce();

    share.mockRejectedValueOnce(new Error('share failed'));
    await user.click(shareButton);
    expect((await screen.findByRole('alert')).textContent).toContain(
      '이미지를 공유하지 못했습니다. 이미지 저장하기를 이용해 주세요.',
    );
  });
});
