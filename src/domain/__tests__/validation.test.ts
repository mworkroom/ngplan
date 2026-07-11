import { describe, expect, it } from 'vitest';

import {
  derivePeriod,
  validateOrganizationSnapshot,
  validatePeriod,
  validatePlan,
} from '../../engine/index';
import type {
  CalculatePlanInput,
  Half,
  MemberSnapshot,
  NormalizedAllocationCell,
  OpeningStateInput,
  OrganizationSnapshotInput,
  PeriodInput,
  RuleSet,
  Side,
  ValidationCode,
  ValidationIssue,
  ValidationLocation,
} from '../../engine/index';
import { DEFAULT_RULE_SET } from '../constants';
import { createValidationReport } from '../validation';

const PERIOD: PeriodInput = { year: 2026, month: 7, half: 'FIRST_HALF' };
const SECOND_HALF: Half = 'SECOND_HALF';
const ZERO_OPENING: OpeningStateInput = {
  fortnightPvpOpeningCredit: 0,
  dailyCarryPvp: 0,
  dailyCarryLeft: 0,
  dailyCarryRight: 0,
};

function root(
  memberKey = 'A',
  overrides: Partial<MemberSnapshot> = {},
): MemberSnapshot {
  return {
    memberKey,
    memberId: `ID-${memberKey}`,
    name: `회원 ${memberKey}`,
    pvpTarget: 700,
    sheetMarker: 'NONE',
    parentMemberKey: null,
    sideAtParent: null,
    ...overrides,
  };
}

function child(
  memberKey: string,
  parentMemberKey: string,
  sideAtParent: Side,
  overrides: Partial<MemberSnapshot> = {},
): MemberSnapshot {
  return {
    memberKey,
    memberId: `ID-${memberKey}`,
    name: `회원 ${memberKey}`,
    pvpTarget: 700,
    sheetMarker: 'NONE',
    parentMemberKey,
    sideAtParent,
    ...overrides,
  };
}

function openingsFor(
  members: readonly MemberSnapshot[],
): Readonly<Record<string, OpeningStateInput>> {
  return Object.fromEntries(members.map((member) => [member.memberKey, ZERO_OPENING]));
}

function allocationsFor(
  members: readonly MemberSnapshot[],
  period: PeriodInput = PERIOD,
): readonly NormalizedAllocationCell[] {
  const occupied = new Set(
    members
      .filter(
        (member) => member.parentMemberKey !== null && member.sideAtParent !== null,
      )
      .map((member) => `${member.parentMemberKey}\u0000${member.sideAtParent}`),
  );
  return derivePeriod(period).dates.flatMap((date) =>
    members.map((member) => ({
      date,
      memberKey: member.memberKey,
      pvp: 0,
      ...(occupied.has(`${member.memberKey}\u0000LEFT`) ? {} : { selfLeft: 0 }),
      ...(occupied.has(`${member.memberKey}\u0000RIGHT`) ? {} : { selfRight: 0 }),
    })),
  );
}

function planFor(
  members: readonly MemberSnapshot[],
  options: {
    readonly period?: PeriodInput;
    readonly openings?: Readonly<Record<string, OpeningStateInput>>;
    readonly allocations?: readonly NormalizedAllocationCell[];
  } = {},
): CalculatePlanInput {
  const period = options.period ?? PERIOD;
  return {
    period,
    organization: organizationFor(members, options.openings),
    allocations: options.allocations ?? allocationsFor(members, period),
  };
}

function organizationFor(
  members: readonly MemberSnapshot[],
  openings: Readonly<Record<string, OpeningStateInput>> = openingsFor(members),
): OrganizationSnapshotInput {
  return {
    snapshotId: 'snapshot-1',
    members,
    openingStateByMember: openings,
  };
}

function validPlan(): CalculatePlanInput {
  return planFor([root()]);
}

function issueCodes(input: CalculatePlanInput): readonly ValidationCode[] {
  return validatePlan(input).issues.map((issue) => issue.code);
}

function replaceCell(
  allocations: readonly NormalizedAllocationCell[],
  date: string,
  memberKey: string,
  replacement: (cell: NormalizedAllocationCell) => NormalizedAllocationCell,
): readonly NormalizedAllocationCell[] {
  return allocations.map((cell) =>
    cell.date === date && cell.memberKey === memberKey ? replacement(cell) : cell,
  );
}

const ORGANIZATION_VALIDATION_CODES = new Set<ValidationCode>([
  'PV_INVALID',
  'PV_NEGATIVE',
  'PV_NOT_INTEGER',
  'PV_OUT_OF_RANGE',
  'MEMBER_KEY_REQUIRED',
  'MEMBER_KEY_DUPLICATE',
  'MEMBER_ID_REQUIRED',
  'MEMBER_ID_DUPLICATE',
  'MEMBER_NAME_REQUIRED',
  'PVP_TARGET_INVALID',
  'SHEET_MARKER_INVALID',
  'PLACEMENT_INCOMPLETE',
  'ROOT_PLACEMENT_INVALID',
  'PARENT_NOT_FOUND',
  'PARENT_SIDE_OCCUPIED',
  'MEMBER_ATTACHED_MULTIPLE_TIMES',
  'ORGANIZATION_CYCLE',
  'ROOT_MISSING',
  'MULTIPLE_ROOTS',
  'ORGANIZATION_DISCONNECTED',
  'OPENING_STATE_MISSING',
  'OPENING_STATE_MEMBER_NOT_FOUND',
]);

function withoutSnapshotId(location: ValidationLocation): ValidationLocation {
  return Object.fromEntries(
    Object.entries(location).filter(([key]) => key !== 'snapshotId'),
  ) as ValidationLocation;
}

describe('Phase 2용 Phase 1 공개 검증 경계', () => {
  it.each([
    [{ year: 2027, month: 2, half: SECOND_HALF }, '2027-02-28'],
    [{ year: 2028, month: 2, half: SECOND_HALF }, '2028-02-29'],
    [{ year: 2026, month: 4, half: SECOND_HALF }, '2026-04-30'],
    [{ year: 2026, month: 7, half: SECOND_HALF }, '2026-07-31'],
  ] as const)(
    '28/29/30/31일 월의 유효한 기간을 독립 검증한다: %o → %s',
    (period, expectedEndDate) => {
      const report = validatePeriod(period);

      expect(report.isValid).toBe(true);
      expect(report.issues).toEqual([]);
      expect(derivePeriod(period).endDate).toBe(expectedEndDate);
    },
  );

  it.each([null, [], '2026-07-FIRST_HALF'])(
    '기간의 비객체 런타임 구조를 예외 없이 거부한다: %s',
    (period) => {
      const report = validatePeriod(period);

      expect(report.errors).toEqual([
        expect.objectContaining({
          code: 'INPUT_STRUCTURE_INVALID',
          location: { field: 'period' },
        }),
      ]);
    },
  );

  it('기간 필드 오류가 validatePlan과 같은 세부 계약을 사용한다', () => {
    const period = {} as PeriodInput;
    const standalone = validatePeriod(period);
    const planIssues = validatePlan({
      ...validPlan(),
      period,
      allocations: [],
    }).issues
      .filter((issue) => issue.code.startsWith('PERIOD_'))
      .map((issue) => ({
        ...issue,
        location: withoutSnapshotId(issue.location),
      }));

    expect(standalone.issues).toEqual(planIssues);
    expect(standalone.issues.map((issue) => issue.code).sort()).toEqual([
      'PERIOD_HALF_INVALID',
      'PERIOD_MONTH_INVALID',
      'PERIOD_YEAR_INVALID',
    ]);
  });

  it.each([
    null,
    [],
    {},
    { snapshotId: 'snapshot-1', members: [null], openingStateByMember: {} },
    { snapshotId: 'snapshot-1', members: [], openingStateByMember: [] },
    { snapshotId: 'snapshot-1', members: [], openingStateByMember: { A: 0 } },
  ])('조직의 잘못된 런타임 구조를 예외 없이 거부한다: %s', (organization) => {
    const report = validateOrganizationSnapshot(organization);

    expect(report.errors).toEqual([
      expect.objectContaining({
        code: 'INPUT_STRUCTURE_INVALID',
        location: { field: 'organization' },
      }),
    ]);
  });

  it('완전한 조직을 독립 검증하고 입력과 불변 보고서를 보존한다', () => {
    const organization = organizationFor([
      root('A'),
      child('B', 'A', 'LEFT'),
      child('C', 'A', 'RIGHT'),
    ]);
    const before = structuredClone(organization);
    const report = validateOrganizationSnapshot(organization);

    expect(report.isValid).toBe(true);
    expect(report.issues).toEqual([]);
    expect(organization).toEqual(before);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.issues)).toBe(true);
  });

  it.each([
    {
      name: 'duplicate member ID',
      members: [root('A'), child('B', 'A', 'LEFT', { memberId: 'ID-A' })],
    },
    {
      name: 'duplicate occupied slot',
      members: [root('A'), child('B', 'A', 'LEFT'), child('C', 'A', 'LEFT')],
    },
    {
      name: 'missing parent',
      members: [root('A'), child('B', 'UNKNOWN', 'LEFT')],
    },
    {
      name: 'cycle',
      members: [child('A', 'B', 'LEFT'), child('B', 'A', 'RIGHT')],
    },
    {
      name: 'multiple roots',
      members: [root('A'), root('B')],
    },
    {
      name: 'disconnected cycle below one root',
      members: [root('A'), child('B', 'C', 'LEFT'), child('C', 'B', 'RIGHT')],
    },
    {
      name: 'invalid PVP target',
      members: [root('A', { pvpTarget: 1000 as 700 })],
    },
  ] satisfies readonly { readonly name: string; readonly members: readonly MemberSnapshot[] }[])(
    '조직 오류 코드·위치·메시지를 validatePlan과 동일하게 유지한다: $name',
    ({ members }) => {
      const organization = organizationFor(members);
      const standalone = validateOrganizationSnapshot(organization);
      const planIssues = validatePlan({
        period: PERIOD,
        organization,
        allocations: [],
      }).issues.filter((issue) => ORGANIZATION_VALIDATION_CODES.has(issue.code));

      expect(standalone.issues).toEqual(planIssues);
      expect(standalone.errors.length).toBeGreaterThan(0);
    },
  );

  it('시작값 누락·여분·PV 오류도 validatePlan과 완전히 동일하다', () => {
    const members = [root('A'), child('B', 'A', 'LEFT')];
    const organization = organizationFor(members, {
      A: { ...ZERO_OPENING, dailyCarryRight: -1 },
      UNKNOWN: ZERO_OPENING,
    });
    const standalone = validateOrganizationSnapshot(organization);
    const planIssues = validatePlan({
      period: PERIOD,
      organization,
      allocations: [],
    }).issues.filter((issue) => ORGANIZATION_VALIDATION_CODES.has(issue.code));

    expect(standalone.issues).toEqual(planIssues);
    expect(standalone.issues.map((issue) => issue.code)).toEqual([
      'PV_NEGATIVE',
      'OPENING_STATE_MISSING',
      'OPENING_STATE_MEMBER_NOT_FOUND',
    ]);
  });
});

describe('[ORG-003] — 연결 방향 직접 입력 거부', () => {
  it('값이 1인 연결 방향 필드를 CONNECTED_SIDE_ALLOCATION으로 거부한다', () => {
    const members = [root('A'), child('B', 'A', 'LEFT')];
    const base = planFor(members);
    const allocations = replaceCell(base.allocations, '2026-07-01', 'A', (cell) => ({
      ...cell,
      selfLeft: 1,
    }));
    const report = validatePlan({ ...base, allocations });

    expect(report.isValid).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: 'CONNECTED_SIDE_ALLOCATION',
        location: expect.objectContaining({
          date: '2026-07-01',
          memberKey: 'A',
          side: 'LEFT',
        }),
      }),
    );
  });

  it('값이 0이어도 구조적으로 존재하면 거부한다', () => {
    const members = [root('A'), child('B', 'A', 'LEFT')];
    const base = planFor(members);
    const allocations = replaceCell(base.allocations, '2026-07-01', 'A', (cell) => ({
      ...cell,
      selfLeft: 0,
    }));

    expect(issueCodes({ ...base, allocations })).toContain('CONNECTED_SIDE_ALLOCATION');
  });
});

describe('[ORG-004] — 조직 순환 거부', () => {
  it('두 회원의 순환을 ORGANIZATION_CYCLE로 거부하고 연쇄 ROOT_MISSING은 만들지 않는다', () => {
    const members = [child('A', 'B', 'LEFT'), child('B', 'A', 'RIGHT')];
    const input = planFor(members, { allocations: [] });
    const codes = issueCodes(input);

    expect(codes).toContain('ORGANIZATION_CYCLE');
    expect(codes).not.toContain('ROOT_MISSING');
  });
});

describe('[ORG-005] — 같은 슬롯의 두 자식 거부', () => {
  it('한 부모의 같은 방향을 PARENT_SIDE_OCCUPIED로 거부한다', () => {
    const members = [root('A'), child('B', 'A', 'LEFT'), child('C', 'A', 'LEFT')];

    expect(issueCodes(planFor(members, { allocations: [] }))).toContain(
      'PARENT_SIDE_OCCUPIED',
    );
  });
});

describe('[VAL-001] — PV 숫자 형식 사전 검증', () => {
  it.each([
    [-1, 'PV_NEGATIVE'],
    [1.5, 'PV_NOT_INTEGER'],
    ['not-a-number', 'PV_INVALID'],
    [Number.MAX_SAFE_INTEGER + 1, 'PV_OUT_OF_RANGE'],
  ] as const)('시작값 %s를 %s로 거부한다', (value, code) => {
    const member = root();
    const input = planFor([member], {
      openings: {
        A: { ...ZERO_OPENING, dailyCarryPvp: value as unknown as number },
      },
    });

    expect(issueCodes(input)).toContain(code);
  });
});

describe('[VAL-002] — 반월 밖 날짜', () => {
  it('7월 상반기의 7월 16일 입력을 DATE_OUTSIDE_PERIOD로 거부한다', () => {
    const input = validPlan();
    const outsideCell: NormalizedAllocationCell = {
      date: '2026-07-16',
      memberKey: 'A',
      pvp: 0,
      selfLeft: 0,
      selfRight: 0,
    };
    const report = validatePlan({
      ...input,
      allocations: [...input.allocations, outsideCell],
    });

    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: 'DATE_OUTSIDE_PERIOD',
        location: expect.objectContaining({ date: '2026-07-16' }),
      }),
    );
  });
});

describe('[VAL-003] — 중복 회원 ID', () => {
  it('회사 회원 ID 중복을 MEMBER_ID_DUPLICATE로 거부한다', () => {
    const members = [root('A'), child('B', 'A', 'LEFT', { memberId: 'ID-A' })];

    expect(issueCodes(planFor(members))).toContain('MEMBER_ID_DUPLICATE');
  });

  it('이름만 같은 회원은 허용한다', () => {
    const members = [
      root('A', { name: '같은 이름' }),
      child('B', 'A', 'LEFT', { name: '같은 이름' }),
    ];

    expect(validatePlan(planFor(members)).isValid).toBe(true);
  });
});

describe('[VAL-005] — 조직 참조 무결성', () => {
  it('존재하지 않는 부모 키를 PARENT_NOT_FOUND로 거부한다', () => {
    const members = [root('A'), child('B', 'UNKNOWN', 'LEFT')];

    expect(issueCodes(planFor(members, { allocations: [] }))).toContain(
      'PARENT_NOT_FOUND',
    );
  });

  it('자기 자신을 부모로 둔 회원을 ORGANIZATION_CYCLE로 거부한다', () => {
    expect(issueCodes(planFor([child('A', 'A', 'LEFT')], { allocations: [] }))).toContain(
      'ORGANIZATION_CYCLE',
    );
  });

  it('중복 memberKey와 서로 다른 부착 위치를 각각 식별한다', () => {
    const members = [
      root('A'),
      root('B'),
      child('A', 'B', 'LEFT', { memberId: 'ID-A-SECOND' }),
    ];
    const codes = issueCodes(planFor(members, { allocations: [] }));

    expect(codes).toContain('MEMBER_KEY_DUPLICATE');
    expect(codes).toContain('MEMBER_ATTACHED_MULTIPLE_TIMES');
  });

  it('같은 memberKey의 동일·상이 방향 중복을 결정적으로 구분한다', () => {
    const members = [
      root('B'),
      child('A', 'B', 'LEFT'),
      child('A', 'B', 'RIGHT', { memberId: 'ID-A-RIGHT' }),
      child('A', 'B', 'LEFT', { memberId: 'ID-A-LEFT-SECOND' }),
    ];
    const codes = issueCodes(planFor(members, { allocations: [] }));

    expect(codes.filter((code) => code === 'MEMBER_KEY_DUPLICATE')).toHaveLength(2);
    expect(codes.filter((code) => code === 'MEMBER_ATTACHED_MULTIPLE_TIMES')).toHaveLength(1);
  });

  it('부모만 있고 방향이 없는 배치를 PLACEMENT_INCOMPLETE로 거부한다', () => {
    const incomplete = {
      ...child('B', 'A', 'LEFT'),
      sideAtParent: null,
    } as MemberSnapshot;

    expect(issueCodes(planFor([root('A'), incomplete], { allocations: [] }))).toContain(
      'PLACEMENT_INCOMPLETE',
    );
  });

  it('루트에 방향이 있으면 ROOT_PLACEMENT_INVALID로 거부한다', () => {
    const invalidRoot = {
      ...root('A'),
      sideAtParent: 'LEFT',
    } as MemberSnapshot;

    expect(issueCodes(planFor([invalidRoot], { allocations: [] }))).toContain(
      'ROOT_PLACEMENT_INVALID',
    );
  });
});

describe('[VAL-006] — 회원별 시작값 완전성', () => {
  it('누락과 조직에 없는 시작값을 각각 식별한다', () => {
    const members = [root('A'), child('B', 'A', 'LEFT')];
    const input = planFor(members, {
      openings: { A: ZERO_OPENING, UNKNOWN: ZERO_OPENING },
    });
    const report = validatePlan(input);

    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: 'OPENING_STATE_MISSING',
        location: expect.objectContaining({ memberKey: 'B' }),
      }),
    );
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: 'OPENING_STATE_MEMBER_NOT_FOUND',
        location: expect.objectContaining({ memberKey: 'UNKNOWN' }),
      }),
    );
  });

  it('키는 있지만 값이 undefined인 시작값도 누락으로 처리한다', () => {
    const input = planFor([root('A')], {
      openings: { A: undefined as unknown as OpeningStateInput },
    });

    expect(issueCodes(input)).toContain('OPENING_STATE_MISSING');
  });
});

describe('[VAL-P01] — PVP 목표와 찾기 표지판', () => {
  it.each([-1, 0, 1.5, 1000])('지원하지 않는 목표 %s를 거부한다', (pvpTarget) => {
    expect(
      issueCodes(planFor([root('A', { pvpTarget: pvpTarget as 700 })])),
    ).toContain('PVP_TARGET_INVALID');
  });

  it.each([2400, 1500, 700] as const)('목표 %s를 허용한다', (pvpTarget) => {
    expect(validatePlan(planFor([root('A', { pvpTarget })])).isValid).toBe(true);
  });

  it('지원하지 않는 찾기 표지판을 거부한다', () => {
    expect(
      issueCodes(planFor([root('A', { sheetMarker: 'PURPLE_4' as 'NONE' })])),
    ).toContain('SHEET_MARKER_INVALID');
  });
});

describe('[VAL-P02] — 루트와 연결 조건', () => {
  it('루트가 없으면 ROOT_MISSING을 반환한다', () => {
    const members = [child('A', 'UNKNOWN', 'LEFT')];

    expect(issueCodes(planFor(members, { allocations: [] }))).toContain('ROOT_MISSING');
  });

  it('루트가 둘이면 MULTIPLE_ROOTS를 반환한다', () => {
    expect(issueCodes(planFor([root('A'), root('B')], { allocations: [] }))).toContain(
      'MULTIPLE_ROOTS',
    );
  });

  it('루트에서 도달할 수 없는 회원을 ORGANIZATION_DISCONNECTED로 반환한다', () => {
    const members = [root('A'), child('B', 'C', 'LEFT'), child('C', 'B', 'RIGHT')];

    expect(issueCodes(planFor(members, { allocations: [] }))).toContain(
      'ORGANIZATION_DISCONNECTED',
    );
  });

  it('루트 한 명의 연결된 비순환 트리를 허용한다', () => {
    const members = [
      root('A'),
      child('B', 'A', 'LEFT'),
      child('C', 'A', 'RIGHT'),
      child('D', 'B', 'LEFT'),
    ];

    expect(validatePlan(planFor(members)).isValid).toBe(true);
  });
});

describe('[CAL-003] / [CAL-P01] — 일요일 신규 입력 금지', () => {
  it('일요일의 모든 비영 PV를 NON_ZERO_INPUT_ON_SKIPPED_DATE로 거부한다', () => {
    const input = validPlan();
    const allocations = replaceCell(input.allocations, '2026-07-12', 'A', (cell) => ({
      ...cell,
      pvp: 1,
      selfLeft: 2,
      selfRight: 3,
    }));
    const report = validatePlan({ ...input, allocations });
    const sundayErrors = report.errors.filter(
      (issue) => issue.code === 'NON_ZERO_INPUT_ON_SKIPPED_DATE',
    );

    expect(sundayErrors).toHaveLength(3);
    expect(sundayErrors.map((issue) => issue.location.field).sort()).toEqual([
      'pvp',
      'selfLeft',
      'selfRight',
    ]);
  });

  it('일요일의 명시적인 0 셀은 허용한다', () => {
    expect(validatePlan(validPlan()).isValid).toBe(true);
  });
});

describe('Phase 1 정규 입력 완전성 검증', () => {
  it('SELF 필드 누락을 SELF_SIDE_ALLOCATION_MISSING으로 거부한다', () => {
    const input = validPlan();
    const allocations = replaceCell(input.allocations, '2026-07-01', 'A', (cell) => {
      const { selfLeft: _removed, ...withoutLeft } = cell;
      return withoutLeft;
    });

    expect(issueCodes({ ...input, allocations })).toContain('SELF_SIDE_ALLOCATION_MISSING');
  });

  it('pvp 필드 누락을 ALLOCATION_FIELD_MISSING으로 거부한다', () => {
    const input = validPlan();
    const allocations = replaceCell(input.allocations, '2026-07-01', 'A', (cell) => {
      const { pvp: _removed, ...withoutPvp } = cell;
      return withoutPvp as NormalizedAllocationCell;
    });

    expect(issueCodes({ ...input, allocations })).toContain('ALLOCATION_FIELD_MISSING');
  });

  it('날짜·회원 중복 셀을 ALLOCATION_CELL_DUPLICATE로 거부한다', () => {
    const input = validPlan();

    expect(
      issueCodes({ ...input, allocations: [...input.allocations, input.allocations[0]!] }),
    ).toContain('ALLOCATION_CELL_DUPLICATE');
  });

  it('날짜·회원 셀 누락을 ALLOCATION_CELL_MISSING으로 거부한다', () => {
    const input = validPlan();

    expect(issueCodes({ ...input, allocations: input.allocations.slice(1) })).toContain(
      'ALLOCATION_CELL_MISSING',
    );
  });

  it('조직에 없는 입력 회원을 ALLOCATION_MEMBER_NOT_FOUND로 거부한다', () => {
    const input = validPlan();
    const unknown: NormalizedAllocationCell = {
      date: '2026-07-01',
      memberKey: 'UNKNOWN',
      pvp: 0,
      selfLeft: 0,
      selfRight: 0,
    };

    expect(issueCodes({ ...input, allocations: [...input.allocations, unknown] })).toContain(
      'ALLOCATION_MEMBER_NOT_FOUND',
    );
  });

  it('실재하지 않는 날짜를 DATE_INVALID로 거부한다', () => {
    const input = validPlan();
    const invalidDate: NormalizedAllocationCell = {
      date: '2026-02-30',
      memberKey: 'A',
      pvp: 0,
      selfLeft: 0,
      selfRight: 0,
    };

    expect(issueCodes({ ...input, allocations: [...input.allocations, invalidDate] })).toContain(
      'DATE_INVALID',
    );
  });

  it('문자열이 아닌 날짜와 회원 키도 위치 정보 생성 중 예외 없이 거부한다', () => {
    const input = validPlan();
    const malformed = {
      date: 20260701,
      memberKey: 42,
      pvp: 0,
      selfLeft: 0,
      selfRight: 0,
    } as unknown as NormalizedAllocationCell;
    const codes = issueCodes({ ...input, allocations: [...input.allocations, malformed] });

    expect(codes).toContain('DATE_INVALID');
    expect(codes).toContain('ALLOCATION_MEMBER_NOT_FOUND');
  });
});

describe('Phase 1 입력 스칼라와 오류 보고서', () => {
  it.each([
    [{ year: 0, month: 7, half: 'FIRST_HALF' }, 'PERIOD_YEAR_INVALID'],
    [{ year: 2026, month: 13, half: 'FIRST_HALF' }, 'PERIOD_MONTH_INVALID'],
    [{ year: 2026, month: 7, half: 'UNKNOWN' }, 'PERIOD_HALF_INVALID'],
  ] as const)('잘못된 기간을 식별한다: %s', (period, code) => {
    const input = validPlan();

    expect(
      issueCodes({ ...input, period: period as unknown as PeriodInput, allocations: [] }),
    ).toContain(code);
  });

  it('빈 내부 키와 이름은 거부하고 빈 회사 회원 ID는 허용한다', () => {
    const member = root('', { memberId: '', name: '' });
    const codes = issueCodes(planFor([member], { allocations: [] }));

    expect(codes).toContain('MEMBER_KEY_REQUIRED');
    expect(codes).not.toContain('MEMBER_ID_REQUIRED');
    expect(codes).toContain('MEMBER_NAME_REQUIRED');
  });

  it('지원하지 않는 규칙 버전을 RULESET_VERSION_UNSUPPORTED로 거부한다', () => {
    const invalidRules = {
      ...DEFAULT_RULE_SET,
      rulesetVersion: '999.0.0',
    } as unknown as RuleSet;

    expect(validatePlan(validPlan(), invalidRules).issues.map((issue) => issue.code)).toContain(
      'RULESET_VERSION_UNSUPPORTED',
    );
  });

  it('오류와 경고를 안정적으로 분리하고 불변 보고서를 만든다', () => {
    const source: ValidationIssue[] = [
      {
        code: 'MEMBER_NAME_REQUIRED',
        severity: 'WARNING',
        location: { memberKey: 'B' },
        message: '경고',
      },
      {
        code: 'MEMBER_ID_REQUIRED',
        severity: 'ERROR',
        location: { memberKey: 'A', field: 'memberId' },
        message: '오류',
      },
    ];
    const report = createValidationReport(source);

    expect(report.isValid).toBe(false);
    expect(report.errors).toHaveLength(1);
    expect(report.warnings).toHaveLength(1);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.issues)).toBe(true);
    expect(Object.isFrozen(report.issues[0]?.location)).toBe(true);
  });
});
