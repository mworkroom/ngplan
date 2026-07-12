import { describe, expect, it } from 'vitest';

import { CALENDAR_VERSION } from '../constants';
import {
  daysInMonth,
  derivePeriod,
  getGregorianDayOfWeek,
  isLeapYear,
  isSunday,
  isValidIsoDate,
  settlementModeForDate,
  toIsoDate,
} from '../period';
import type { Half, IsoDate } from '../types';

describe('[CAL-001] — 윤년 하반기 날짜 경계', () => {
  it('2028년 2월 하반기를 16일부터 29일까지 만든다', () => {
    const period = derivePeriod({ year: 2028, month: 2, half: 'SECOND_HALF' });

    expect(period.startDate).toBe('2028-02-16');
    expect(period.endDate).toBe('2028-02-29');
    expect(period.dates).toHaveLength(14);
    expect(period.dates.filter(isSunday)).toEqual(['2028-02-20', '2028-02-27']);
  });
});

describe('[CAL-002] — 상·하반기와 월말 경계 표', () => {
  it.each([
    [2026, 4, 'FIRST_HALF', '2026-04-01', '2026-04-15', 15],
    [2026, 4, 'SECOND_HALF', '2026-04-16', '2026-04-30', 15],
    [2026, 7, 'SECOND_HALF', '2026-07-16', '2026-07-31', 16],
    [2027, 2, 'SECOND_HALF', '2027-02-16', '2027-02-28', 13],
    [2028, 2, 'SECOND_HALF', '2028-02-16', '2028-02-29', 14],
  ] as const)(
    '%s년 %s월 %s의 날짜 경계를 계산한다',
    (year, month, half, startDate, endDate, length) => {
      const period = derivePeriod({ year, month, half: half as Half });
      expect(period).toMatchObject({ startDate, endDate });
      expect(period.dates).toHaveLength(length);
    },
  );

  it('월별 일수와 윤년 규칙을 현재 시각 없이 계산한다', () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 7)).toBe(31);
  });
});

describe('[CAL-P01] — 일요일의 입력·정산·표시 정책', () => {
  it('calendar contract 1.0.0의 proleptic Gregorian 요일을 계산한다', () => {
    expect(CALENDAR_VERSION).toBe('1.0.0');
    expect(getGregorianDayOfWeek('0001-01-01' as IsoDate)).toBe(1);
    expect(getGregorianDayOfWeek('2000-01-01' as IsoDate)).toBe(6);
    expect(getGregorianDayOfWeek('2026-07-12' as IsoDate)).toBe(0);
  });

  it('host timezone 설정과 무관하게 같은 일요일을 반환한다', () => {
    const originalTimezone = process.env.TZ;
    try {
      for (const timezone of ['Asia/Seoul', 'America/Sao_Paulo', 'UTC']) {
        process.env.TZ = timezone;
        expect(isSunday('2026-07-12' as IsoDate)).toBe(true);
        expect(isSunday('2026-07-13' as IsoDate)).toBe(false);
      }
    } finally {
      if (originalTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimezone;
      }
    }
  });

  it('일요일만 SKIP_NO_INPUT이고 토요일·공휴일은 SETTLE이다', () => {
    expect(settlementModeForDate('2026-07-12' as IsoDate)).toBe('SKIP_NO_INPUT');
    expect(settlementModeForDate('2026-07-11' as IsoDate)).toBe('SETTLE');
    expect(settlementModeForDate('2026-07-15' as IsoDate)).toBe('SETTLE');
  });

  it('실재하는 ISO 날짜만 허용한다', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2026/07/01')).toBe(false);
    expect(isValidIsoDate('0000-01-01')).toBe(false);
    expect(isValidIsoDate('2026-00-01')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-01-00')).toBe(false);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
  });

  it('날짜 구성 요소를 ISO 날짜로 고정 폭 변환한다', () => {
    expect(toIsoDate(2026, 7, 1)).toBe('2026-07-01');
  });
});

describe('[CAL-P02] — 일요일이 보름 마지막 날인 경우', () => {
  it('마지막 일요일도 날짜 행에 보존한다', () => {
    const period = derivePeriod({ year: 2026, month: 11, half: 'FIRST_HALF' });

    expect(period.endDate).toBe('2026-11-15');
    expect(settlementModeForDate(period.endDate)).toBe('SKIP_NO_INPUT');
    expect(period.dates.at(-1)).toBe('2026-11-15');
  });
});
