import { parsePv } from '../../engine';
import type { NormalizedAllocationCell, Side } from '../../engine';
import type { ProjectSetupBundle } from '../project-setup';
import {
  deriveManualPlanSchema,
  manualPlanCellKey,
} from './derive-manual-plan-schema';
import type {
  ManualPlanCellDraft,
  ManualPlanDraft,
  ManualPlanField,
  ManualPlanIssue,
  ManualPlanIssueCode,
  ManualPlanPvParseOutcome,
  ManualPlanSchema,
  NormalizeManualPlanOutcome,
} from './types';

const DIGITS_ONLY = /^\d+$/;
const NEGATIVE_NUMBER = /^-\d+(?:\.\d+)?$/;
const FRACTION = /^\d+\.\d+$/;

const PV_MESSAGES = {
  PV_INVALID: 'PV는 부호·지수·공백 없는 0 이상의 정수로 입력해 주세요.',
  PV_NEGATIVE: 'PV는 0 이상이어야 합니다.',
  PV_NOT_INTEGER: 'PV는 1 PV 단위의 정수여야 합니다.',
  PV_OUT_OF_RANGE: 'PV는 안전한 정수 범위 안이어야 합니다.',
} as const;

export function parseManualPlanPv(value: string): ManualPlanPvParseOutcome {
  if (value === '') {
    return { ok: true, value: 0 };
  }
  if (NEGATIVE_NUMBER.test(value)) {
    return { ok: false, code: 'PV_NEGATIVE' };
  }
  if (FRACTION.test(value)) {
    return { ok: false, code: 'PV_NOT_INTEGER' };
  }
  if (!DIGITS_ONLY.test(value)) {
    return { ok: false, code: 'PV_INVALID' };
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isSafeInteger(numeric)) {
    return { ok: false, code: 'PV_OUT_OF_RANGE' };
  }
  return parsePv(numeric);
}

function issue(
  code: ManualPlanIssueCode,
  location: ManualPlanIssue['location'],
  message: string,
  suggestion?: string,
): ManualPlanIssue {
  const base = { code, severity: 'ERROR' as const, location, message };
  return Object.freeze(suggestion === undefined ? base : { ...base, suggestion });
}

function parseField(
  cell: ManualPlanCellDraft,
  field: ManualPlanField,
  side: Side | undefined,
  issues: ManualPlanIssue[],
): number | undefined {
  if (!Object.hasOwn(cell, field)) {
    const code = field === 'pvp' ? 'ALLOCATION_FIELD_MISSING' : 'SELF_SIDE_ALLOCATION_MISSING';
    issues.push(
      issue(
        code,
        {
          date: cell.date,
          memberKey: cell.memberKey,
          ...(side === undefined ? {} : { side }),
          field,
        },
        field === 'pvp'
          ? '계획 셀에는 PVP 입력이 필요합니다.'
          : '직접 입력 방향에는 0을 포함한 계획값이 필요합니다.',
      ),
    );
    return undefined;
  }
  const raw: unknown = cell[field];
  if (typeof raw !== 'string') {
    issues.push(
      issue(
        'PV_INVALID',
        {
          date: cell.date,
          memberKey: cell.memberKey,
          ...(side === undefined ? {} : { side }),
          field,
        },
        PV_MESSAGES.PV_INVALID,
      ),
    );
    return undefined;
  }
  const parsed = parseManualPlanPv(raw);
  if (!parsed.ok) {
    issues.push(
      issue(
        parsed.code,
        {
          date: cell.date,
          memberKey: cell.memberKey,
          ...(side === undefined ? {} : { side }),
          field,
        },
        PV_MESSAGES[parsed.code],
        '0 이상의 안전한 정수 PV를 입력해 주세요.',
      ),
    );
    return undefined;
  }
  return parsed.value;
}

function sortIssues(issues: readonly ManualPlanIssue[]): readonly ManualPlanIssue[] {
  return Object.freeze(
    [...issues].sort((left, right) => {
      const leftKey = [
        left.location.date ?? '',
        left.location.memberKey ?? '',
        left.location.side ?? '',
        left.location.field ?? '',
        left.code,
      ].join('\u0000');
      const rightKey = [
        right.location.date ?? '',
        right.location.memberKey ?? '',
        right.location.side ?? '',
        right.location.field ?? '',
        right.code,
      ].join('\u0000');
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
  );
}

export function normalizeManualPlanDraft(
  bundle: ProjectSetupBundle,
  draft: ManualPlanDraft,
  schema: ManualPlanSchema = deriveManualPlanSchema(bundle),
): NormalizeManualPlanOutcome {
  const issues: ManualPlanIssue[] = [];
  const cellByKey = new Map<string, ManualPlanCellDraft>();

  for (const cell of draft.cells) {
    const dateKnown = schema.dateByIso.has(cell.date);
    const memberKnown = schema.memberByKey.has(cell.memberKey);
    if (!dateKnown || !memberKnown) {
      issues.push(
        issue(
          !dateKnown ? 'DATE_OUTSIDE_PERIOD' : 'ALLOCATION_MEMBER_NOT_FOUND',
          { date: cell.date, memberKey: cell.memberKey, field: !dateKnown ? 'date' : 'memberKey' },
          !dateKnown
            ? `날짜 ${cell.date}는 대상 반월 밖입니다.`
            : '계획 셀의 회원을 현재 조직에서 찾을 수 없습니다.',
        ),
      );
      continue;
    }
    const key = manualPlanCellKey(cell.date, cell.memberKey);
    if (cellByKey.has(key)) {
      issues.push(
        issue(
          'ALLOCATION_CELL_DUPLICATE',
          { date: cell.date, memberKey: cell.memberKey, field: 'allocations' },
          '같은 날짜와 회원의 계획 셀이 중복됩니다.',
        ),
      );
      continue;
    }
    cellByKey.set(key, cell);
  }

  const allocations: NormalizedAllocationCell[] = [];
  for (const date of schema.dates) {
    for (const member of schema.members) {
      const cell = cellByKey.get(manualPlanCellKey(date.date, member.memberKey));
      if (cell === undefined) {
        issues.push(
          issue(
            'ALLOCATION_CELL_MISSING',
            { date: date.date, memberKey: member.memberKey, field: 'allocations' },
            '날짜와 회원에 대응하는 계획 셀이 없습니다.',
          ),
        );
        continue;
      }

      if (member.leftMode === 'CHILD' && Object.hasOwn(cell, 'selfLeft')) {
        issues.push(
          issue(
            'CONNECTED_SIDE_ALLOCATION',
            { date: date.date, memberKey: member.memberKey, side: 'LEFT', field: 'selfLeft' },
            '하위 회원이 연결된 왼쪽은 조직 합계이므로 직접 계획값을 둘 수 없습니다.',
          ),
        );
      }
      if (member.rightMode === 'CHILD' && Object.hasOwn(cell, 'selfRight')) {
        issues.push(
          issue(
            'CONNECTED_SIDE_ALLOCATION',
            { date: date.date, memberKey: member.memberKey, side: 'RIGHT', field: 'selfRight' },
            '하위 회원이 연결된 오른쪽은 조직 합계이므로 직접 계획값을 둘 수 없습니다.',
          ),
        );
      }

      const pvp = parseField(cell, 'pvp', undefined, issues);
      const selfLeft = member.leftMode === 'SELF'
        ? parseField(cell, 'selfLeft', 'LEFT', issues)
        : undefined;
      const selfRight = member.rightMode === 'SELF'
        ? parseField(cell, 'selfRight', 'RIGHT', issues)
        : undefined;

      if (date.settlementMode === 'SKIP_NO_INPUT') {
        const sundayValues = [
          ['pvp', pvp, undefined],
          ['selfLeft', selfLeft, 'LEFT'],
          ['selfRight', selfRight, 'RIGHT'],
        ] as const;
        for (const [field, value, side] of sundayValues) {
          if (value !== undefined && value !== 0) {
            issues.push(
              issue(
                'NON_ZERO_INPUT_ON_SKIPPED_DATE',
                {
                  date: date.date,
                  memberKey: member.memberKey,
                  ...(side === undefined ? {} : { side }),
                  field,
                },
                '일요일에는 신규 PV를 입력할 수 없습니다.',
                '일요일 계획값을 0으로 바꿔 주세요.',
              ),
            );
          }
        }
      }

      if (
        pvp !== undefined &&
        (member.leftMode === 'CHILD' || selfLeft !== undefined) &&
        (member.rightMode === 'CHILD' || selfRight !== undefined)
      ) {
        allocations.push(
          Object.freeze({
            date: date.date,
            memberKey: member.memberKey,
            pvp: date.settlementMode === 'SKIP_NO_INPUT' ? 0 : pvp,
            ...(member.leftMode === 'SELF'
              ? { selfLeft: date.settlementMode === 'SKIP_NO_INPUT' ? 0 : selfLeft! }
              : {}),
            ...(member.rightMode === 'SELF'
              ? { selfRight: date.settlementMode === 'SKIP_NO_INPUT' ? 0 : selfRight! }
              : {}),
          }),
        );
      }
    }
  }

  if (issues.length > 0) {
    return Object.freeze({ status: 'FAILURE', issues: sortIssues(issues) });
  }
  return Object.freeze({
    status: 'SUCCESS',
    input: Object.freeze({
      period: bundle.project.period,
      organization: bundle.organization,
      allocations: Object.freeze(allocations),
    }),
  });
}
