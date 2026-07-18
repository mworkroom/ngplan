import { DEFAULT_RULE_SET } from './constants';
import { derivePeriod, isSunday, isValidIsoDate } from './period';
import { parsePv } from './pv';
import type {
  CalculatePlanInput,
  DerivedPeriod,
  MemberSnapshot,
  NormalizedAllocationCell,
  OrganizationSnapshotInput,
  PeriodInput,
  RuleSet,
  Side,
  ValidationCode,
  ValidationIssue,
  ValidationLocation,
  ValidationReport,
} from './types';

type MutableIssueList = ValidationIssue[];

interface OrganizationValidationState {
  readonly memberByKey: ReadonlyMap<string, MemberSnapshot>;
  readonly connectedSlots: ReadonlySet<string>;
  readonly topologyUsable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPeriodInputStructure(value: unknown): value is PeriodInput {
  try {
    return isRecord(value);
  } catch {
    return false;
  }
}

function isOrganizationSnapshotInputStructure(
  value: unknown,
): value is OrganizationSnapshotInput {
  try {
    if (!isRecord(value)) {
      return false;
    }
    const members = value.members;
    const openingStateByMember = value.openingStateByMember;
    return (
      Array.isArray(members) &&
      members.every(isRecord) &&
      isRecord(openingStateByMember) &&
      Object.values(openingStateByMember).every(
        (opening) => opening === undefined || isRecord(opening),
      )
    );
  } catch {
    return false;
  }
}

export function isCalculatePlanInputStructure(
  value: unknown,
): value is CalculatePlanInput {
  try {
    if (!isRecord(value)) {
      return false;
    }
    const period = value.period;
    const organization = value.organization;
    const allocations = value.allocations;
    if (
      !isRecord(period) ||
      !isRecord(organization) ||
      !Array.isArray(organization.members) ||
      !organization.members.every(isRecord) ||
      !isRecord(organization.openingStateByMember) ||
      !Object.values(organization.openingStateByMember).every(
        (opening) => opening === undefined || isRecord(opening),
      ) ||
      !Array.isArray(allocations) ||
      !allocations.every(isRecord)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const TOPOLOGY_BLOCKING_CODES = new Set<ValidationCode>([
  'MEMBER_KEY_REQUIRED',
  'MEMBER_KEY_DUPLICATE',
  'PLACEMENT_INCOMPLETE',
  'ROOT_PLACEMENT_INVALID',
  'PARENT_NOT_FOUND',
  'PARENT_SIDE_OCCUPIED',
  'MEMBER_ATTACHED_MULTIPLE_TIMES',
  'ORGANIZATION_CYCLE',
  'ROOT_MISSING',
  'MULTIPLE_ROOTS',
  'ORGANIZATION_DISCONNECTED',
]);

const PV_MESSAGES = {
  PV_INVALID: 'PV 숫자를 입력해 주세요.',
  PV_NEGATIVE: 'PV는 0 이상이어야 합니다.',
  PV_NOT_INTEGER: 'PV는 소수점 없이 숫자만 입력해 주세요.',
  PV_OUT_OF_RANGE: '입력한 PV 숫자가 너무 큽니다.',
} as const;

function slotKey(parentMemberKey: string, side: Side): string {
  return `${parentMemberKey}\u0000${side}`;
}

function allocationKey(date: string, memberKey: string): string {
  return `${date}\u0000${memberKey}`;
}

function isSide(value: unknown): value is Side {
  return value === 'LEFT' || value === 'RIGHT';
}

function pushIssue(
  issues: MutableIssueList,
  code: ValidationCode,
  location: ValidationLocation,
  message: string,
  suggestion?: string,
): void {
  const base = {
    code,
    severity: 'ERROR' as const,
    location,
    message,
  };
  issues.push(suggestion === undefined ? base : { ...base, suggestion });
}

function validatePvField(
  value: unknown,
  location: ValidationLocation,
  issues: MutableIssueList,
): number | undefined {
  const parsed = parsePv(value);
  if (!parsed.ok) {
    pushIssue(
      issues,
      parsed.code,
      location,
      PV_MESSAGES[parsed.code],
      '0 이상의 숫자를 소수점 없이 입력해 주세요.',
    );
    return undefined;
  }
  return parsed.value;
}

function validatePeriodInput(
  input: PeriodInput,
  baseLocation: ValidationLocation,
  issues: MutableIssueList,
): DerivedPeriod | undefined {
  const raw = input as unknown as {
    readonly year?: unknown;
    readonly month?: unknown;
    readonly half?: unknown;
  };
  let valid = true;

  if (
    typeof raw.year !== 'number' ||
    !Number.isSafeInteger(raw.year) ||
    raw.year < 1 ||
    raw.year > 9999
  ) {
    valid = false;
    pushIssue(
      issues,
      'PERIOD_YEAR_INVALID',
      { ...baseLocation, field: 'period.year' },
      '연도는 숫자로 입력해 주세요.',
    );
  }
  if (
    typeof raw.month !== 'number' ||
    !Number.isSafeInteger(raw.month) ||
    raw.month < 1 ||
    raw.month > 12
  ) {
    valid = false;
    pushIssue(
      issues,
      'PERIOD_MONTH_INVALID',
      { ...baseLocation, field: 'period.month' },
      '월은 1부터 12 사이의 숫자로 입력해 주세요.',
    );
  }
  if (raw.half !== 'FIRST_HALF' && raw.half !== 'SECOND_HALF') {
    valid = false;
    pushIssue(
      issues,
      'PERIOD_HALF_INVALID',
      { ...baseLocation, field: 'period.half' },
      '대상 반기는 FIRST_HALF 또는 SECOND_HALF여야 합니다.',
    );
  }

  return valid ? derivePeriod(input) : undefined;
}

function samePlacement(left: MemberSnapshot, right: MemberSnapshot): boolean {
  return (
    left.parentMemberKey === right.parentMemberKey &&
    left.sideAtParent === right.sideAtParent
  );
}

function findCycles(
  memberByKey: ReadonlyMap<string, MemberSnapshot>,
  parentByMember: ReadonlyMap<string, string>,
): readonly (readonly string[])[] {
  const cycleIds = new Set<string>();
  const cycles: string[][] = [];

  for (const start of memberByKey.keys()) {
    const path: string[] = [];
    const positionByKey = new Map<string, number>();
    let current: string | undefined = start;

    while (current !== undefined && memberByKey.has(current)) {
      const repeatedAt = positionByKey.get(current);
      if (repeatedAt !== undefined) {
        const cycle = path.slice(repeatedAt);
        const canonical = [...cycle].sort().join('\u0000');
        if (!cycleIds.has(canonical)) {
          cycleIds.add(canonical);
          cycles.push(cycle);
        }
        break;
      }
      positionByKey.set(current, path.length);
      path.push(current);
      current = parentByMember.get(current);
    }
  }

  return cycles;
}

function validateOrganization(
  input: CalculatePlanInput['organization'],
  issues: MutableIssueList,
): OrganizationValidationState {
  const snapshotId = input.snapshotId;
  const memberByKey = new Map<string, MemberSnapshot>();
  const firstMemberByKey = new Map<string, MemberSnapshot>();
  const memberIdOwner = new Map<string, string>();

  input.members.forEach((member, index) => {
    const baseLocation = { snapshotId, memberKey: member.memberKey, index };
    if (typeof member.memberKey !== 'string' || member.memberKey.trim() === '') {
      pushIssue(
        issues,
        'MEMBER_KEY_REQUIRED',
        { snapshotId, index, field: 'memberKey' },
        '회원 키는 비어 있지 않은 문자열이어야 합니다.',
      );
    } else {
      const first = firstMemberByKey.get(member.memberKey);
      if (first !== undefined) {
        pushIssue(
          issues,
          'MEMBER_KEY_DUPLICATE',
          { ...baseLocation, field: 'memberKey' },
          `회원 키 ${member.memberKey}가 두 번 이상 사용되었습니다.`,
        );
        if (!samePlacement(first, member)) {
          pushIssue(
            issues,
            'MEMBER_ATTACHED_MULTIPLE_TIMES',
            { ...baseLocation, field: 'parentMemberKey' },
            `회원 ${member.memberKey}가 서로 다른 조직 위치에 중복 연결되었습니다.`,
          );
        }
      } else {
        firstMemberByKey.set(member.memberKey, member);
        memberByKey.set(member.memberKey, member);
      }
    }

    if (typeof member.memberId !== 'string') {
      pushIssue(
        issues,
        'MEMBER_ID_REQUIRED',
        { ...baseLocation, field: 'memberId' },
        '회사 회원 ID는 문자열이어야 합니다.',
      );
    } else if (member.memberId.trim() !== '') {
      const owner = memberIdOwner.get(member.memberId);
      if (owner !== undefined) {
        pushIssue(
          issues,
          'MEMBER_ID_DUPLICATE',
          { ...baseLocation, memberId: member.memberId, field: 'memberId' },
          `회사 회원 ID ${member.memberId}가 회원 ${owner}와 중복됩니다.`,
        );
      } else {
        memberIdOwner.set(member.memberId, member.memberKey);
      }
    }

    if (typeof member.name !== 'string' || member.name.trim() === '') {
      pushIssue(
        issues,
        'MEMBER_NAME_REQUIRED',
        { ...baseLocation, field: 'name' },
        '회원 이름은 비어 있지 않은 문자열이어야 합니다.',
      );
    }
    if (
      typeof member.pvpTarget !== 'number' ||
      !DEFAULT_RULE_SET.allowedPvpTargets.includes(member.pvpTarget)
    ) {
      pushIssue(
        issues,
        'PVP_TARGET_INVALID',
        { ...baseLocation, field: 'pvpTarget' },
        'PVP 목표는 2,400, 1,500, 700 중 하나여야 합니다.',
      );
    }
    if (
      member.sheetMarker !== 'NONE' &&
      member.sheetMarker !== 'PINK_1' &&
      member.sheetMarker !== 'GREEN_2' &&
      member.sheetMarker !== 'BLUE_3' &&
      member.sheetMarker !== 'PURPLE_4'
    ) {
      pushIssue(
        issues,
        'SHEET_MARKER_INVALID',
        { ...baseLocation, field: 'sheetMarker' },
        '이름 표지판 값이 올바르지 않습니다.',
      );
    }

    const parent = member.parentMemberKey as unknown;
    const side = member.sideAtParent as unknown;
    if (parent === null && side !== null) {
      pushIssue(
        issues,
        'ROOT_PLACEMENT_INVALID',
        { ...baseLocation, field: 'sideAtParent' },
        '맨 위 회원은 다른 회원 아래에 놓을 수 없습니다.',
      );
    } else if (
      (parent === null && side === undefined) ||
      (parent !== null && (typeof parent !== 'string' || !isSide(side)))
    ) {
      pushIssue(
        issues,
        'PLACEMENT_INCOMPLETE',
        { ...baseLocation, field: 'parentMemberKey' },
        '맨 위 회원이 아니라면 바로 위 회원과 왼쪽·오른쪽 위치를 정해 주세요.',
      );
    }
  });

  const connectedSlots = new Set<string>();
  const childBySlot = new Map<string, string>();
  const parentByMember = new Map<string, string>();
  for (const member of memberByKey.values()) {
    const parent = member.parentMemberKey;
    const side = member.sideAtParent;
    if (parent === null || !isSide(side)) {
      continue;
    }
    if (!memberByKey.has(parent)) {
      pushIssue(
        issues,
        'PARENT_NOT_FOUND',
        { snapshotId, memberKey: member.memberKey, field: 'parentMemberKey' },
        `회원 ${member.memberKey}님이 연결될 바로 위 회원을 찾을 수 없습니다.`,
      );
      continue;
    }

    parentByMember.set(member.memberKey, parent);
    const key = slotKey(parent, side);
    const occupiedBy = childBySlot.get(key);
    if (occupiedBy !== undefined) {
      pushIssue(
        issues,
        'PARENT_SIDE_OCCUPIED',
        { snapshotId, memberKey: member.memberKey, side, field: 'sideAtParent' },
        `회원 ${parent}의 ${side} 방향은 이미 회원 ${occupiedBy}가 사용하고 있습니다.`,
      );
    } else {
      childBySlot.set(key, member.memberKey);
      connectedSlots.add(key);
    }
  }

  const cycles = findCycles(memberByKey, parentByMember);
  for (const cycle of cycles) {
    const memberKey = [...cycle].sort()[0]!;
    pushIssue(
      issues,
      'ORGANIZATION_CYCLE',
      { snapshotId, memberKey, field: 'parentMemberKey' },
      `조직에 순환 연결이 있습니다: ${cycle.join(' → ')}.`,
      '회원 연결이 빙글빙글 이어지지 않도록 위아래 위치를 다시 확인해 주세요.',
    );
  }

  const roots = [...memberByKey.values()].filter(
    (member) => member.parentMemberKey === null && member.sideAtParent === null,
  );
  if (roots.length === 0 && (memberByKey.size === 0 || cycles.length === 0)) {
    pushIssue(
      issues,
      'ROOT_MISSING',
      { snapshotId, field: 'members' },
      '맨 위 회원이 없습니다.',
    );
  } else if (roots.length > 1) {
    pushIssue(
      issues,
      'MULTIPLE_ROOTS',
      { snapshotId, field: 'members' },
      `맨 위 회원은 한 명이어야 합니다. 현재 ${roots.length}명입니다.`,
    );
  } else if (roots.length === 1) {
    const root = roots[0]!;
    const childrenByParent = new Map<string, string[]>();
    for (const [child, parent] of parentByMember) {
      const children = childrenByParent.get(parent) ?? [];
      children.push(child);
      childrenByParent.set(parent, children);
    }
    const reachable = new Set<string>();
    const stack = [root.memberKey];
    while (stack.length > 0) {
      const current = stack.pop()!;
      reachable.add(current);
      stack.push(...(childrenByParent.get(current) ?? []));
    }
    const disconnected = [...memberByKey.keys()].filter((key) => !reachable.has(key));
    if (disconnected.length > 0) {
      const memberKey = disconnected.sort()[0]!;
      pushIssue(
        issues,
        'ORGANIZATION_DISCONNECTED',
        {
          snapshotId,
          memberKey,
          field: 'members',
        },
        `조직 그림에 연결되지 않은 회원이 있습니다: ${disconnected.join(', ')}.`,
      );
    }
  }

  const topologyUsable = !issues.some((issue) => TOPOLOGY_BLOCKING_CODES.has(issue.code));
  return { memberByKey, connectedSlots, topologyUsable };
}

function validateOpeningStates(
  input: OrganizationSnapshotInput,
  memberByKey: ReadonlyMap<string, MemberSnapshot>,
  issues: MutableIssueList,
): void {
  const states = input.openingStateByMember;
  for (const memberKey of memberByKey.keys()) {
    if (!Object.hasOwn(states, memberKey)) {
      pushIssue(
        issues,
        'OPENING_STATE_MISSING',
        { snapshotId: input.snapshotId, memberKey, field: 'openingStateByMember' },
        `회원 ${memberKey}의 시작값이 없습니다.`,
      );
      continue;
    }
    const state = states[memberKey];
    if (state === undefined) {
      pushIssue(
        issues,
        'OPENING_STATE_MISSING',
        { snapshotId: input.snapshotId, memberKey, field: 'openingStateByMember' },
        `회원 ${memberKey}의 시작값이 없습니다.`,
      );
      continue;
    }
    const openingQualificationPvp = validatePvField(
      state.openingQualificationPvp,
      { snapshotId: input.snapshotId, memberKey, field: 'openingQualificationPvp' },
      issues,
    );
    const fortnightPvpOpeningCredit = validatePvField(
      state.fortnightPvpOpeningCredit,
      { snapshotId: input.snapshotId, memberKey, field: 'fortnightPvpOpeningCredit' },
      issues,
    );
    const dailyCarryPvp = validatePvField(
      state.dailyCarryPvp,
      { snapshotId: input.snapshotId, memberKey, field: 'dailyCarryPvp' },
      issues,
    );
    validatePvField(
      state.dailyCarryLeft,
      { snapshotId: input.snapshotId, memberKey, field: 'dailyCarryLeft' },
      issues,
    );
    validatePvField(
      state.dailyCarryRight,
      { snapshotId: input.snapshotId, memberKey, field: 'dailyCarryRight' },
      issues,
    );

    if (
      openingQualificationPvp !== undefined &&
      openingQualificationPvp > DEFAULT_RULE_SET.cumulativePvpCap
    ) {
      pushIssue(
        issues,
        'CUMULATIVE_PVP_OPENING_EXCEEDS_CAP',
        { snapshotId: input.snapshotId, memberKey, field: 'openingQualificationPvp' },
        `누적 PVP 시작값은 ${DEFAULT_RULE_SET.cumulativePvpCap.toLocaleString('ko-KR')}을 넘을 수 없습니다.`,
        '회사에서 확인한 현재 누적 PVP를 0~2,400 범위로 입력해 주세요.',
      );
    }
    if (
      fortnightPvpOpeningCredit !== undefined &&
      fortnightPvpOpeningCredit > DEFAULT_RULE_SET.cumulativePvpCap &&
      fortnightPvpOpeningCredit !== openingQualificationPvp
    ) {
      pushIssue(
        issues,
        'CUMULATIVE_PVP_OPENING_EXCEEDS_CAP',
        { snapshotId: input.snapshotId, memberKey, field: 'fortnightPvpOpeningCredit' },
        `보름 계산에 쓰는 누적 PVP 시작값은 ${DEFAULT_RULE_SET.cumulativePvpCap.toLocaleString('ko-KR')}을 넘을 수 없습니다.`,
      );
    }
    if (
      openingQualificationPvp !== undefined &&
      fortnightPvpOpeningCredit !== undefined &&
      openingQualificationPvp !== fortnightPvpOpeningCredit
    ) {
      pushIssue(
        issues,
        'CUMULATIVE_PVP_OPENING_MISMATCH',
        { snapshotId: input.snapshotId, memberKey, field: 'fortnightPvpOpeningCredit' },
        '수당 자격과 보름 계산은 같은 누적 PVP 시작값을 사용해야 합니다.',
        '화면의 누적 PVP 하나를 두 내부 장부의 공통 시작값으로 사용해 주세요.',
      );
    }
    if (dailyCarryPvp !== undefined && dailyCarryPvp !== 0) {
      pushIssue(
        issues,
        'DAILY_PVP_OPENING_NONZERO',
        { snapshotId: input.snapshotId, memberKey, field: 'dailyCarryPvp' },
        '첫날 일일 PVP 시작 잔액은 항상 0이어야 합니다.',
        '회사 누적 PVP는 자격·보름 시작값에만 넣고 좌·우 시작 잔액은 별도로 입력해 주세요.',
      );
    }
  }

  for (const memberKey of Object.keys(states)) {
    if (!memberByKey.has(memberKey)) {
      pushIssue(
        issues,
        'OPENING_STATE_MEMBER_NOT_FOUND',
        { snapshotId: input.snapshotId, memberKey, field: 'openingStateByMember' },
        `조직에 없는 회원 ${memberKey}의 시작값이 있습니다.`,
      );
    }
  }
}

function collectOrganizationValidation(
  input: OrganizationSnapshotInput,
  issues: MutableIssueList,
): OrganizationValidationState {
  const organizationState = validateOrganization(input, issues);
  validateOpeningStates(input, organizationState.memberByKey, issues);
  return organizationState;
}

function validateAllocationPvFields(
  cell: NormalizedAllocationCell,
  baseLocation: ValidationLocation,
  issues: MutableIssueList,
): Readonly<Record<'pvp' | 'selfLeft' | 'selfRight', number | undefined>> {
  let pvp: number | undefined;
  let selfLeft: number | undefined;
  let selfRight: number | undefined;
  if (!Object.hasOwn(cell, 'pvp')) {
    pushIssue(
      issues,
      'ALLOCATION_FIELD_MISSING',
      { ...baseLocation, field: 'pvp' },
      'PVP 입력칸이 빠져 있습니다.',
    );
  } else {
    pvp = validatePvField(cell.pvp, { ...baseLocation, field: 'pvp' }, issues);
  }
  if (Object.hasOwn(cell, 'selfLeft')) {
    selfLeft = validatePvField(
      cell.selfLeft,
      { ...baseLocation, side: 'LEFT', field: 'selfLeft' },
      issues,
    );
  }
  if (Object.hasOwn(cell, 'selfRight')) {
    selfRight = validatePvField(
      cell.selfRight,
      { ...baseLocation, side: 'RIGHT', field: 'selfRight' },
      issues,
    );
  }
  return { pvp, selfLeft, selfRight };
}

function validateSideAllocation(
  cell: NormalizedAllocationCell,
  side: Side,
  isConnected: boolean,
  baseLocation: ValidationLocation,
  issues: MutableIssueList,
): void {
  const field = side === 'LEFT' ? 'selfLeft' : 'selfRight';
  if (isConnected && Object.hasOwn(cell, field)) {
    pushIssue(
      issues,
      'CONNECTED_SIDE_ALLOCATION',
      { ...baseLocation, side, field },
      `아래 회원이 연결된 ${side}쪽 값은 자동으로 계산되므로 직접 입력할 수 없습니다.`,
      '아래 회원의 PVP·좌·우 값을 입력해 주세요.',
    );
  } else if (!isConnected && !Object.hasOwn(cell, field)) {
    pushIssue(
      issues,
      'SELF_SIDE_ALLOCATION_MISSING',
      { ...baseLocation, side, field },
      `${side}쪽에 아래 회원이 없다면 PV 값을 입력해 주세요. 값이 없으면 0을 입력합니다.`,
    );
  }
}

function validateAllocations(
  allocations: readonly NormalizedAllocationCell[],
  period: DerivedPeriod | undefined,
  organization: CalculatePlanInput['organization'],
  organizationState: OrganizationValidationState,
  issues: MutableIssueList,
): void {
  const dateSet = period === undefined ? new Set<string>() : new Set(period.dates);
  const presentCells = new Set<string>();
  const directPvpTotalByMember = new Map<string, number>();
  let identityError = false;

  allocations.forEach((cell, index) => {
    const rawDate: unknown = cell.date;
    const rawMemberKey: unknown = cell.memberKey;
    const dateValid = typeof rawDate === 'string' && isValidIsoDate(rawDate);
    const memberKeyValid =
      typeof rawMemberKey === 'string' && organizationState.memberByKey.has(rawMemberKey);
    const baseLocation: ValidationLocation = {
      snapshotId: organization.snapshotId,
      ...(typeof rawDate === 'string' ? { date: rawDate } : {}),
      ...(typeof rawMemberKey === 'string' ? { memberKey: rawMemberKey } : {}),
      index,
    };

    if (!dateValid) {
      identityError = true;
      pushIssue(
        issues,
        'DATE_INVALID',
        { ...baseLocation, field: 'date' },
        '입력 날짜는 실제 존재하는 YYYY-MM-DD 형식이어야 합니다.',
      );
    } else if (period !== undefined && !dateSet.has(rawDate)) {
      identityError = true;
      pushIssue(
        issues,
        'DATE_OUTSIDE_PERIOD',
        { ...baseLocation, field: 'date' },
        `날짜 ${rawDate}는 이번 계획 기간에 포함되지 않습니다.`,
      );
    }

    if (!memberKeyValid) {
      identityError = true;
      pushIssue(
        issues,
        'ALLOCATION_MEMBER_NOT_FOUND',
        { ...baseLocation, field: 'memberKey' },
        `직접 입력의 회원 ${String(rawMemberKey)}을 조직에서 찾을 수 없습니다.`,
      );
    }

    if (dateValid && memberKeyValid && period !== undefined && dateSet.has(rawDate)) {
      const key = allocationKey(rawDate, rawMemberKey);
      if (presentCells.has(key)) {
        identityError = true;
        pushIssue(
          issues,
          'ALLOCATION_CELL_DUPLICATE',
          { ...baseLocation, field: 'allocations' },
          `날짜 ${rawDate}, 회원 ${rawMemberKey} 입력 셀이 중복됩니다.`,
        );
      } else {
        presentCells.add(key);
      }
    }

    const parsed = validateAllocationPvFields(cell, baseLocation, issues);
    if (memberKeyValid && parsed.pvp !== undefined) {
      const previous = directPvpTotalByMember.get(rawMemberKey) ?? 0;
      const cappedOverflow = DEFAULT_RULE_SET.cumulativePvpCap + 1;
      directPvpTotalByMember.set(
        rawMemberKey,
        parsed.pvp > cappedOverflow - previous
          ? cappedOverflow
          : previous + parsed.pvp,
      );
    }
    if (organizationState.topologyUsable && memberKeyValid) {
      const leftConnected = organizationState.connectedSlots.has(
        slotKey(rawMemberKey, 'LEFT'),
      );
      const rightConnected = organizationState.connectedSlots.has(
        slotKey(rawMemberKey, 'RIGHT'),
      );
      validateSideAllocation(cell, 'LEFT', leftConnected, baseLocation, issues);
      validateSideAllocation(cell, 'RIGHT', rightConnected, baseLocation, issues);
    }

    if (dateValid && isSunday(rawDate)) {
      for (const [field, value] of Object.entries(parsed)) {
        if (value !== undefined && value !== 0) {
          pushIssue(
            issues,
            'NON_ZERO_INPUT_ON_SKIPPED_DATE',
            { ...baseLocation, field },
            `일요일 ${rawDate}에는 신규 ${field} PV를 입력할 수 없습니다.`,
            '일요일 직접 입력을 0으로 바꿔 주세요.',
          );
        }
      }
    }
  });

  for (const [memberKey, directPvpTotal] of directPvpTotalByMember) {
    const opening = organization.openingStateByMember[memberKey];
    const cumulativePvpOpening = opening?.openingQualificationPvp;
    if (
      typeof cumulativePvpOpening !== 'number' ||
      !Number.isSafeInteger(cumulativePvpOpening) ||
      Object.is(cumulativePvpOpening, -0) ||
      cumulativePvpOpening < 0 ||
      cumulativePvpOpening > DEFAULT_RULE_SET.cumulativePvpCap
    ) {
      continue;
    }
    const headroom = DEFAULT_RULE_SET.cumulativePvpCap - cumulativePvpOpening;
    if (directPvpTotal > headroom) {
      pushIssue(
        issues,
        'CUMULATIVE_PVP_ALLOCATION_EXCEEDS_CAP',
        {
          snapshotId: organization.snapshotId,
          memberKey,
          field: 'pvp',
        },
        `누적 PVP ${cumulativePvpOpening.toLocaleString('ko-KR')}에 이번 기간 신규 PVP ${directPvpTotal.toLocaleString('ko-KR')}을 더하면 평생 상한 ${DEFAULT_RULE_SET.cumulativePvpCap.toLocaleString('ko-KR')}을 넘습니다.`,
        `이 회원의 이번 기간 신규 PVP 합계를 ${headroom.toLocaleString('ko-KR')} 이하로 줄여 주세요.`,
      );
    }
  }

  if (
    period !== undefined &&
    organizationState.topologyUsable &&
    !identityError
  ) {
    for (const date of period.dates) {
      for (const memberKey of [...organizationState.memberByKey.keys()].sort()) {
        if (!presentCells.has(allocationKey(date, memberKey))) {
          pushIssue(
            issues,
            'ALLOCATION_CELL_MISSING',
            {
              snapshotId: organization.snapshotId,
              date,
              memberKey,
              field: 'allocations',
            },
            `날짜 ${date}, 회원 ${memberKey}님의 입력칸이 빠져 있습니다.`,
          );
        }
      }
    }
  }
}

function issueSortKey(issue: ValidationIssue): string {
  const location = issue.location;
  return [
    location.date ?? '',
    location.memberKey ?? '',
    location.side ?? '',
    location.field ?? '',
    issue.code,
    String(location.index ?? ''),
  ].join('\u0000');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasCanonicalRuleSetBody(rules: RuleSet): boolean {
  const expected = DEFAULT_RULE_SET;
  try {
    return (
      rules.commissionTiers.length === expected.commissionTiers.length &&
      rules.commissionTiers.every(
        (tier, index) => tier === expected.commissionTiers[index],
      ) &&
      rules.allowedPvpTargets.length === expected.allowedPvpTargets.length &&
      rules.allowedPvpTargets.every(
        (target, index) => target === expected.allowedPvpTargets[index],
      ) &&
      rules.cumulativePvpCap === expected.cumulativePvpCap &&
      rules.fortnightSideTarget === expected.fortnightSideTarget &&
      rules.businessCalendarPolicy === expected.businessCalendarPolicy &&
      rules.pvpTiePolicy === expected.pvpTiePolicy &&
      rules.fortnightPvpSourcePolicy === expected.fortnightPvpSourcePolicy &&
      rules.target700CommissionPreference.eligiblePvpTarget ===
        expected.target700CommissionPreference.eligiblePvpTarget &&
      rules.target700CommissionPreference.recommendedEquivalentUnits ===
        expected.target700CommissionPreference.recommendedEquivalentUnits &&
      rules.qualificationPolicy.threshold ===
        expected.qualificationPolicy.threshold &&
      rules.qualificationPolicy.accumulation ===
        expected.qualificationPolicy.accumulation &&
      rules.qualificationPolicy.belowThresholdSettlement ===
        expected.qualificationPolicy.belowThresholdSettlement
    );
  } catch {
    return false;
  }
}

export function createValidationReport(
  sourceIssues: readonly ValidationIssue[],
): ValidationReport {
  const issues = sourceIssues
    .map((issue) =>
      Object.freeze({
        ...issue,
        location: Object.freeze({ ...issue.location }),
      }),
    )
    .sort((left, right) => compareText(issueSortKey(left), issueSortKey(right)));
  const errors = issues.filter((issue) => issue.severity === 'ERROR');
  const warnings = issues.filter((issue) => issue.severity === 'WARNING');
  return Object.freeze({
    isValid: errors.length === 0,
    issues: Object.freeze(issues),
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
  });
}

/** Phase 1 period rules without requiring organization or allocation input. */
export function validatePeriod(input: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!isPeriodInputStructure(input)) {
    pushIssue(
      issues,
      'INPUT_STRUCTURE_INVALID',
      { field: 'period' },
      '기간 입력은 연도, 월, 반기를 가진 객체여야 합니다.',
      '연도, 월, 기간을 다시 선택해 주세요.',
    );
    return createValidationReport(issues);
  }

  validatePeriodInput(input, {}, issues);
  return createValidationReport(issues);
}

/** Phase 1 organization and opening-state rules without allocation input. */
export function validateOrganizationSnapshot(input: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!isOrganizationSnapshotInputStructure(input)) {
    pushIssue(
      issues,
      'INPUT_STRUCTURE_INVALID',
      { field: 'organization' },
      '조직 입력은 회원 배열과 회원별 시작값을 가진 객체여야 합니다.',
      '회원과 시작값을 다시 확인해 주세요.',
    );
    return createValidationReport(issues);
  }

  collectOrganizationValidation(input, issues);
  return createValidationReport(issues);
}

export function validatePlan(
  input: unknown,
  rules: RuleSet = DEFAULT_RULE_SET,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!isCalculatePlanInputStructure(input)) {
    pushIssue(
      issues,
      'INPUT_STRUCTURE_INVALID',
      { field: 'input' },
      '계산 입력은 기간, 조직, 시작값, 직접 입력 배열을 가진 객체여야 합니다.',
      '기간, 회원, 시작값과 계획표 입력을 다시 확인해 주세요.',
    );
    return createValidationReport(issues);
  }
  const snapshotId = input.organization.snapshotId;
  let rulesetVersion: unknown;
  try {
    rulesetVersion = (
      rules as unknown as { readonly rulesetVersion?: unknown }
    ).rulesetVersion;
  } catch {
    rulesetVersion = undefined;
  }
  if (rulesetVersion !== DEFAULT_RULE_SET.rulesetVersion) {
    pushIssue(
      issues,
      'RULESET_VERSION_UNSUPPORTED',
      { snapshotId, field: 'rulesetVersion' },
      `지원하지 않는 규칙 버전입니다: ${String(rulesetVersion)}.`,
    );
  } else if (!hasCanonicalRuleSetBody(rules)) {
    pushIssue(
      issues,
      'RULESET_BODY_MISMATCH',
      { snapshotId, field: 'ruleset' },
      '규칙 버전 7.0.0의 본문이 확정된 규칙과 일치하지 않습니다.',
      '내보낸 기본 RuleSet 7.0.0을 변경하지 않고 사용해 주세요.',
    );
  }

  const period = validatePeriodInput(input.period, { snapshotId }, issues);
  const organizationState = collectOrganizationValidation(input.organization, issues);
  validateAllocations(
    input.allocations,
    period,
    input.organization,
    organizationState,
    issues,
  );
  return createValidationReport(issues);
}
