import type { DerivedPeriod, IsoDate, PeriodInput, SettlementMode } from './types';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const GREGORIAN_MONTH_OFFSETS = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;

export type GregorianDayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as IsoDate;
}

export function derivePeriod(period: PeriodInput): DerivedPeriod {
  const firstDay = period.half === 'FIRST_HALF' ? 1 : 16;
  const lastDay = period.half === 'FIRST_HALF' ? 15 : daysInMonth(period.year, period.month);
  const dates: IsoDate[] = [];
  for (let day = firstDay; day <= lastDay; day += 1) {
    dates.push(toIsoDate(period.year, period.month, day));
  }
  const startDate = dates[0];
  const endDate = dates.at(-1);
  if (startDate === undefined || endDate === undefined) {
    throw new Error('반월 기간에 날짜가 없습니다.');
  }
  return {
    ...period,
    startDate,
    endDate,
    dates,
  };
}

export function isValidIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    Number.isInteger(year) &&
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export function getGregorianDayOfWeek(date: IsoDate): GregorianDayOfWeek {
  const [yearText, monthText, dayText] = date.split('-');
  let year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 3) {
    year -= 1;
  }
  const monthOffset = GREGORIAN_MONTH_OFFSETS[month - 1]!;
  return (
    (year +
      Math.floor(year / 4) -
      Math.floor(year / 100) +
      Math.floor(year / 400) +
      monthOffset +
      day) %
    7
  ) as GregorianDayOfWeek;
}

export function isSunday(date: IsoDate): boolean {
  return getGregorianDayOfWeek(date) === 0;
}

export function settlementModeForDate(date: IsoDate): SettlementMode {
  return isSunday(date) ? 'SKIP_NO_INPUT' : 'SETTLE';
}
