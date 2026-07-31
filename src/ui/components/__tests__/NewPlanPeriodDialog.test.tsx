import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewPlanPeriodDialog } from '../NewPlanPeriodDialog';

afterEach(cleanup);

describe('NewPlanPeriodDialog', () => {
  it('blocks invalid dates and confirms the explicitly selected range', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <NewPlanPeriodDialog
        recommended={{ year: 2026, month: 8, half: 'FIRST_HALF' }}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    const year = screen.getByLabelText('연도');
    const month = screen.getByLabelText('월');
    const confirm = screen.getByRole('button', { name: '이 기간으로 시작' });
    await user.clear(year);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('날짜를 확인해 주세요')).toBeDefined();
    await user.type(year, '2027');
    await user.clear(month);
    await user.type(month, '12');
    await user.selectOptions(screen.getByLabelText('반기'), 'SECOND_HALF');
    expect(screen.getByText('2027년 12월 16일–31일')).toBeDefined();
    await user.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({
      year: 2027,
      month: 12,
      half: 'SECOND_HALF',
    });
  });

  it('can cancel before a plan is created', async () => {
    const onCancel = vi.fn();
    render(
      <NewPlanPeriodDialog
        recommended={{ year: 2026, month: 8, half: 'FIRST_HALF' }}
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
