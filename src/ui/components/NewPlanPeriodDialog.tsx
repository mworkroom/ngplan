import { useMemo, useState } from 'react';
import type { Half } from '../../engine';
import {
  formatPlanningPeriodRange,
  isValidPlanningPeriod,
  type PlanningPeriod,
} from '../../cloud/plan-recovery';

export interface NewPlanPeriodDialogProps {
  readonly recommended: PlanningPeriod;
  readonly onConfirm: (period: PlanningPeriod) => void;
  readonly onCancel: () => void;
}

export function NewPlanPeriodDialog({
  recommended,
  onConfirm,
  onCancel,
}: NewPlanPeriodDialogProps) {
  const [year, setYear] = useState(String(recommended.year));
  const [month, setMonth] = useState(String(recommended.month));
  const [half, setHalf] = useState<Half>(recommended.half);
  const period = useMemo<PlanningPeriod>(
    () => ({ year: Number(year), month: Number(month), half }),
    [half, month, year],
  );
  const valid = isValidPlanningPeriod(period);

  return (
    <div className="period-dialog-backdrop" role="presentation">
      <section
        className="period-dialog new-plan-period-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-plan-period-title"
      >
        <div className="period-dialog__header">
          <div>
            <p className="period-confirmation__eyebrow">시작 전 필수 확인</p>
            <h2 id="new-plan-period-title">새 계획의 날짜가 맞나요?</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onCancel}>
            취소
          </button>
        </div>
        <p className="period-confirmation__warning">
          기간이 달라지면 날짜별 숫자를 그대로 옮길 수 없습니다. 숫자를 넣기 전에
          반드시 확인해 주세요.
        </p>
        <div className="period-confirmation__fields">
          <label>
            연도
            <input
              type="number"
              min="2000"
              max="2200"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
          </label>
          <label>
            월
            <input
              type="number"
              min="1"
              max="12"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          <label>
            반기
            <select
              value={half}
              onChange={(event) => setHalf(event.target.value as Half)}
            >
              <option value="FIRST_HALF">상반기 (1–15일)</option>
              <option value="SECOND_HALF">하반기 (16일–말일)</option>
            </select>
          </label>
        </div>
        <div className="period-confirmation__result" aria-live="polite">
          <span>선택한 기간</span>
          <strong>{valid ? formatPlanningPeriodRange(period) : '날짜를 확인해 주세요'}</strong>
          <small>브라질 업무일 기준 · 다음 반기를 추천값으로 표시했습니다.</small>
        </div>
        <div className="period-confirmation__actions">
          <button
            type="button"
            className="primary-button"
            disabled={!valid}
            onClick={() => onConfirm(period)}
          >
            이 기간으로 시작
          </button>
        </div>
      </section>
    </div>
  );
}
