import {
  derivePeriod,
  settlementModeForDate,
  type IsoDate,
} from '../engine';
import { AUTOMATIC_PLAN_CALENDAR_VERSION } from './constants';
import { automaticPlanError } from './errors';
import type {
  AutomaticPlanRequest,
  NormalizedAutomaticPlanCalendar,
  SafeAutomaticPlanError,
} from './types';

export type AutomaticPlanCalendarValidationOutcome =
  | { readonly status: 'SUCCESS' }
  | { readonly status: 'FAILURE'; readonly error: SafeAutomaticPlanError };

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function deriveNormalizedAutomaticPlanCalendar(
  period: AutomaticPlanRequest['period'],
): NormalizedAutomaticPlanCalendar {
  const dates = derivePeriod(period).dates.map(String);
  const skipDateSet = dates.filter(
    (date) => settlementModeForDate(date as IsoDate) === 'SKIP_NO_INPUT',
  );
  return Object.freeze({
    calendarVersion: AUTOMATIC_PLAN_CALENDAR_VERSION,
    dates: Object.freeze(dates),
    skipDateSet: Object.freeze(skipDateSet),
  });
}

export function validateAutomaticPlanCalendar(
  request: AutomaticPlanRequest,
): AutomaticPlanCalendarValidationOutcome {
  if (request.calendar.calendarVersion !== AUTOMATIC_PLAN_CALENDAR_VERSION) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_VERSION_UNSUPPORTED',
        '자동 계획 달력 버전을 지원하지 않습니다.',
      ),
    };
  }
  const expected = deriveNormalizedAutomaticPlanCalendar(request.period);
  const skipDates = request.calendar.skipDateSet;
  if (
    new Set(request.calendar.dates).size !== request.calendar.dates.length ||
    new Set(skipDates).size !== skipDates.length ||
    !arraysEqual(request.calendar.dates, expected.dates) ||
    !arraysEqual(skipDates, expected.skipDateSet)
  ) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_CALENDAR_INVALID',
        '자동 계획 날짜와 정산 제외 날짜가 반월 달력과 일치하지 않습니다.',
      ),
    };
  }
  return { status: 'SUCCESS' };
}
