import type { NormalizedAllocationCell, Side } from '../../engine';
import type { ProjectSetupBundle } from '../project-setup';
import {
  deriveManualPlanSchema,
  manualPlanCellKey,
} from './derive-manual-plan-schema';
import { isManualPlanDraftModified } from './is-manual-plan-draft-modified';
import { normalizeManualPlanDraft } from './normalize-manual-plan';
import type {
  ConvertVerifiedAllocationsToManualPlanDraftOutcome,
  ManualPlanCellDraft,
  ManualPlanDraft,
  ManualPlanField,
  ManualPlanIssue,
  ManualPlanIssueCode,
} from './types';

const ALLOWED_ALLOCATION_FIELDS = new Set<PropertyKey>([
  'date',
  'memberKey',
  'pvp',
  'selfLeft',
  'selfRight',
]);

function issue(
  code: ManualPlanIssueCode,
  location: ManualPlanIssue['location'],
  message: string,
): ManualPlanIssue {
  return Object.freeze({
    code,
    severity: 'ERROR' as const,
    location: Object.freeze(location),
    message,
  });
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

function parsePvField(
  allocation: Readonly<Record<PropertyKey, unknown>>,
  field: ManualPlanField,
  date: string,
  memberKey: string,
  side: Side | undefined,
  issues: ManualPlanIssue[],
): number | undefined {
  if (!Object.hasOwn(allocation, field)) {
    issues.push(
      issue(
        field === 'pvp'
          ? 'ALLOCATION_FIELD_MISSING'
          : 'SELF_SIDE_ALLOCATION_MISSING',
        {
          date,
          memberKey,
          ...(side === undefined ? {} : { side }),
          field,
        },
        field === 'pvp'
          ? '검증 계획 셀에는 PVP 값이 필요합니다.'
          : '검증 계획의 직접 입력 방향에는 0을 포함한 값이 필요합니다.',
      ),
    );
    return undefined;
  }

  const raw = allocation[field];
  const location = {
    date,
    memberKey,
    ...(side === undefined ? {} : { side }),
    field,
  };
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    issues.push(issue('PV_INVALID', location, '검증 계획 PV는 숫자여야 합니다.'));
    return undefined;
  }
  if (!Number.isInteger(raw)) {
    issues.push(issue('PV_NOT_INTEGER', location, '검증 계획 PV는 정수여야 합니다.'));
    return undefined;
  }
  if (!Number.isSafeInteger(raw)) {
    issues.push(issue('PV_OUT_OF_RANGE', location, '검증 계획 PV가 안전한 범위를 넘습니다.'));
    return undefined;
  }
  if (raw < 0 || Object.is(raw, -0)) {
    issues.push(issue('PV_NEGATIVE', location, '검증 계획 PV는 0 이상이어야 합니다.'));
    return undefined;
  }
  return raw;
}

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function convertVerifiedAllocationsToManualPlanDraft(
  bundle: ProjectSetupBundle,
  allocations: readonly NormalizedAllocationCell[],
  previousDraft: ManualPlanDraft | null = null,
): ConvertVerifiedAllocationsToManualPlanDraftOutcome {
  const schema = deriveManualPlanSchema(bundle);
  const issues: ManualPlanIssue[] = [];
  const allocationByKey = new Map<
    string,
    Readonly<Record<PropertyKey, unknown>>
  >();

  for (const rawAllocation of allocations as readonly unknown[]) {
    if (!isRecord(rawAllocation)) {
      issues.push(
        issue(
          'INPUT_STRUCTURE_INVALID',
          { field: 'allocations' },
          '검증 계획 배정 셀의 구조가 올바르지 않습니다.',
        ),
      );
      continue;
    }
    const date = rawAllocation.date;
    const memberKey = rawAllocation.memberKey;
    if (typeof date !== 'string' || typeof memberKey !== 'string') {
      issues.push(
        issue(
          'INPUT_STRUCTURE_INVALID',
          { field: typeof date !== 'string' ? 'date' : 'memberKey' },
          '검증 계획 셀에는 날짜와 회원 키가 필요합니다.',
        ),
      );
      continue;
    }
    const unknownField = Reflect.ownKeys(rawAllocation).find(
      (field) => !ALLOWED_ALLOCATION_FIELDS.has(field),
    );
    if (unknownField !== undefined) {
      issues.push(
        issue(
          'INPUT_STRUCTURE_INVALID',
          { date, memberKey, field: String(unknownField) },
          '검증 계획 셀에 허용되지 않은 필드가 있습니다.',
        ),
      );
    }
    if (!schema.dateByIso.has(date)) {
      issues.push(
        issue(
          'DATE_OUTSIDE_PERIOD',
          { date, memberKey, field: 'date' },
          '검증 계획 날짜가 현재 반월에 포함되지 않습니다.',
        ),
      );
      continue;
    }
    if (!schema.memberByKey.has(memberKey)) {
      issues.push(
        issue(
          'ALLOCATION_MEMBER_NOT_FOUND',
          { date, memberKey, field: 'memberKey' },
          '검증 계획 회원이 현재 조직에 없습니다.',
        ),
      );
      continue;
    }
    const key = manualPlanCellKey(date, memberKey);
    if (allocationByKey.has(key)) {
      issues.push(
        issue(
          'ALLOCATION_CELL_DUPLICATE',
          { date, memberKey, field: 'allocations' },
          '같은 날짜와 회원의 검증 계획 셀이 중복됩니다.',
        ),
      );
      continue;
    }
    allocationByKey.set(key, rawAllocation);
  }

  const cells: ManualPlanCellDraft[] = [];
  for (const date of schema.dates) {
    for (const member of schema.members) {
      const allocation = allocationByKey.get(
        manualPlanCellKey(date.date, member.memberKey),
      );
      if (allocation === undefined) {
        issues.push(
          issue(
            'ALLOCATION_CELL_MISSING',
            {
              date: date.date,
              memberKey: member.memberKey,
              field: 'allocations',
            },
            '날짜와 회원에 대응하는 검증 계획 셀이 없습니다.',
          ),
        );
        continue;
      }

      if (member.leftMode === 'CHILD' && Object.hasOwn(allocation, 'selfLeft')) {
        issues.push(
          issue(
            'CONNECTED_SIDE_ALLOCATION',
            {
              date: date.date,
              memberKey: member.memberKey,
              side: 'LEFT',
              field: 'selfLeft',
            },
            '하위 회원이 연결된 왼쪽에는 직접 값을 둘 수 없습니다.',
          ),
        );
      }
      if (member.rightMode === 'CHILD' && Object.hasOwn(allocation, 'selfRight')) {
        issues.push(
          issue(
            'CONNECTED_SIDE_ALLOCATION',
            {
              date: date.date,
              memberKey: member.memberKey,
              side: 'RIGHT',
              field: 'selfRight',
            },
            '하위 회원이 연결된 오른쪽에는 직접 값을 둘 수 없습니다.',
          ),
        );
      }

      const pvp = parsePvField(
        allocation,
        'pvp',
        date.date,
        member.memberKey,
        undefined,
        issues,
      );
      const selfLeft = member.leftMode === 'SELF'
        ? parsePvField(
            allocation,
            'selfLeft',
            date.date,
            member.memberKey,
            'LEFT',
            issues,
          )
        : undefined;
      const selfRight = member.rightMode === 'SELF'
        ? parsePvField(
            allocation,
            'selfRight',
            date.date,
            member.memberKey,
            'RIGHT',
            issues,
          )
        : undefined;
      if (date.settlementMode === 'SKIP_NO_INPUT') {
        for (const [field, value, side] of [
          ['pvp', pvp, undefined],
          ['selfLeft', selfLeft, 'LEFT'],
          ['selfRight', selfRight, 'RIGHT'],
        ] as const) {
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
                '입력 제외 날짜의 검증 계획 값은 모두 0이어야 합니다.',
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
        cells.push(
          Object.freeze({
            date: date.date,
            memberKey: member.memberKey,
            pvp: String(pvp),
            ...(member.leftMode === 'SELF' ? { selfLeft: String(selfLeft) } : {}),
            ...(member.rightMode === 'SELF' ? { selfRight: String(selfRight) } : {}),
          }),
        );
      }
    }
  }

  if (issues.length > 0) {
    return Object.freeze({ status: 'FAILURE', issues: sortIssues(issues) });
  }

  const draft = Object.freeze({ cells: Object.freeze(cells) });
  const normalized = normalizeManualPlanDraft(bundle, draft, schema);
  if (normalized.status === 'FAILURE') {
    return Object.freeze({ status: 'FAILURE', issues: normalized.issues });
  }
  return Object.freeze({
    status: 'SUCCESS',
    draft,
    replacesModifiedDraft:
      previousDraft !== null && isManualPlanDraftModified(schema, previousDraft),
  });
}
