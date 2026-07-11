import type {
  OpeningStateInput,
  PeriodInput,
  ValidationIssue,
} from '../../engine';
import { deriveTopology } from './derive-topology';
import type {
  DraftPvpTargetParseOutcome,
  DraftPvParseOutcome,
  MemberDraft,
  OpeningStateField,
  ProjectSetupDraft,
  ProjectSetupIssue,
  ProjectSetupIssueCode,
  ProjectSetupIssueLocation,
  ProjectSetupValidation,
  ReassignmentQueueEntry,
} from './types';

const PV_FIELDS: readonly OpeningStateField[] = [
  'fortnightPvpOpeningCredit',
  'dailyCarryPvp',
  'dailyCarryLeft',
  'dailyCarryRight',
];

const PV_MESSAGES = {
  PV_INVALID: 'PV 숫자를 입력해 주세요.',
  PV_NEGATIVE: 'PV는 0 이상이어야 합니다.',
  PV_NOT_INTEGER: 'PV는 소수점 없이 숫자만 입력해 주세요.',
  PV_OUT_OF_RANGE: '입력한 PV 숫자가 너무 큽니다.',
} as const;

export function parseDraftPv(value: string): DraftPvParseOutcome {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { ok: false, code: 'PV_INVALID' };
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return {
      ok: false,
      code: /^[-+]?\d/.test(trimmed) ? 'PV_OUT_OF_RANGE' : 'PV_INVALID',
    };
  }
  if (!Number.isInteger(numeric)) {
    return { ok: false, code: 'PV_NOT_INTEGER' };
  }
  if (!Number.isSafeInteger(numeric)) {
    return { ok: false, code: 'PV_OUT_OF_RANGE' };
  }
  if (numeric < 0) {
    return { ok: false, code: 'PV_NEGATIVE' };
  }
  return { ok: true, value: numeric };
}

export function parseDraftPvpTarget(value: string): DraftPvpTargetParseOutcome {
  const numeric = Number(value);
  return value !== '' && (numeric === 2400 || numeric === 1500 || numeric === 700)
    ? { ok: true, value: numeric as 2400 | 1500 | 700 }
    : { ok: false, code: 'PVP_TARGET_INVALID' };
}

function parsePeriodInteger(
  value: string,
  minimum: number,
  maximum: number,
): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const numeric = Number(trimmed);
  return Number.isSafeInteger(numeric) && numeric >= minimum && numeric <= maximum
    ? numeric
    : null;
}

export function parseDraftPeriod(draft: ProjectSetupDraft): PeriodInput | null {
  const year = parsePeriodInteger(draft.year, 1, 9999);
  const month = parsePeriodInteger(draft.month, 1, 12);
  return year === null || month === null
    ? null
    : { year, month, half: draft.half };
}

export function parseMemberOpeningState(
  member: MemberDraft,
): OpeningStateInput | null {
  const parsed = PV_FIELDS.map((field) => parseDraftPv(member.openingState[field]));
  if (parsed.some((outcome) => !outcome.ok)) {
    return null;
  }
  const values = parsed as readonly { readonly ok: true; readonly value: number }[];
  return {
    fortnightPvpOpeningCredit: values[0]!.value,
    dailyCarryPvp: values[1]!.value,
    dailyCarryLeft: values[2]!.value,
    dailyCarryRight: values[3]!.value,
  };
}

function issue(
  code: ProjectSetupIssueCode,
  severity: 'ERROR' | 'WARNING',
  location: ProjectSetupIssueLocation,
  message: string,
  suggestion?: string,
): ProjectSetupIssue {
  const base = { code, severity, location, message };
  return suggestion === undefined ? base : { ...base, suggestion };
}

function compareIssue(left: ProjectSetupIssue, right: ProjectSetupIssue): number {
  const key = (item: ProjectSetupIssue): string =>
    [
      item.location.area ?? '',
      item.location.memberKey ?? '',
      item.location.side ?? '',
      item.location.field ?? '',
      item.code,
    ].join('\u0000');
  const leftKey = key(left);
  const rightKey = key(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

export function createProjectSetupValidation(
  sourceIssues: readonly ProjectSetupIssue[],
  reassignmentQueue: readonly ReassignmentQueueEntry[],
): ProjectSetupValidation {
  const issues = sourceIssues
    .map((item) =>
      Object.freeze({
        ...item,
        location: Object.freeze({ ...item.location }),
      }),
    )
    .sort(compareIssue);
  const errors = issues.filter((item) => item.severity === 'ERROR');
  const warnings = issues.filter((item) => item.severity === 'WARNING');
  return Object.freeze({
    isReady: errors.length === 0,
    issues: Object.freeze(issues),
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    reassignmentQueue: Object.freeze([...reassignmentQueue]),
  });
}

export function fromCanonicalIssue(item: ValidationIssue): ProjectSetupIssue {
  const base = {
    code: item.code,
    severity: item.severity,
    location: { ...item.location },
    message: item.message,
  } as const;
  return item.suggestion === undefined
    ? base
    : { ...base, suggestion: item.suggestion };
}

function validatePeriodFields(
  draft: ProjectSetupDraft,
  issues: ProjectSetupIssue[],
): void {
  if (parsePeriodInteger(draft.year, 1, 9999) === null) {
    issues.push(
      issue(
        'PERIOD_YEAR_INVALID',
        'ERROR',
        { area: 'PROJECT', field: 'period.year' },
        '연도는 네 자리 숫자로 입력해 주세요.',
      ),
    );
  }
  if (parsePeriodInteger(draft.month, 1, 12) === null) {
    issues.push(
      issue(
        'PERIOD_MONTH_INVALID',
        'ERROR',
        { area: 'PROJECT', field: 'period.month' },
        '월은 1부터 12 사이의 숫자로 입력해 주세요.',
      ),
    );
  }
  if (draft.title.trim() === '') {
    issues.push(
      issue(
        'PROJECT_TITLE_REQUIRED',
        'ERROR',
        { area: 'PROJECT', field: 'title' },
        '계획 이름을 입력해 주세요.',
      ),
    );
  }
}

function validateMember(
  member: MemberDraft,
  isRoot: boolean,
  issues: ProjectSetupIssue[],
): void {
  const location = { area: 'MEMBER' as const, memberKey: member.memberKey };
  if (member.name.trim() === '') {
    issues.push(
      issue('MEMBER_NAME_REQUIRED', 'ERROR', { ...location, field: 'name' }, '회원 이름을 입력해 주세요.'),
    );
  }
  const pvpTarget = parseDraftPvpTarget(member.pvpTarget);
  if (!pvpTarget.ok) {
    issues.push(
      issue(
        pvpTarget.code,
        'ERROR',
        { ...location, field: 'pvpTarget' },
        '이번 기간 PVP 목표를 선택해 주세요.',
      ),
    );
  }

  if (isRoot) {
    if (
      member.placement.parentMemberKey !== null ||
      member.placement.sideAtParent !== null
    ) {
      issues.push(
        issue(
          'ROOT_PLACEMENT_INVALID',
          'ERROR',
          { ...location, field: 'parentMemberKey' },
          '최상위 회원은 다른 회원 아래에 놓을 수 없습니다.',
        ),
      );
    }
  } else if (
    (member.placement.parentMemberKey === null) !==
    (member.placement.sideAtParent === null)
  ) {
    issues.push(
      issue(
        'PLACEMENT_INCOMPLETE',
        'ERROR',
        { ...location, field: 'parentMemberKey' },
        '최상위 회원이 아니라면 바로 위 회원과 왼쪽·오른쪽 위치를 정해 주세요.',
      ),
    );
  }

  for (const field of PV_FIELDS) {
    const parsed = parseDraftPv(member.openingState[field]);
    if (!parsed.ok) {
      issues.push(
        issue(
          parsed.code,
          'ERROR',
          { ...location, field },
          PV_MESSAGES[parsed.code],
          '0 이상의 숫자를 소수점 없이 입력해 주세요.',
        ),
      );
    }
  }
  if (!member.openingState.openingStateConfirmed) {
    issues.push(
      issue(
        'MEMBER_OPENING_STATE_UNCONFIRMED',
        'ERROR',
        { ...location, field: 'openingStateConfirmed' },
        '시작값이 맞는지 확인해 주세요.',
      ),
    );
  }
}

function validateDuplicateNames(
  members: readonly MemberDraft[],
  issues: ProjectSetupIssue[],
): void {
  const ownerByName = new Map<string, string>();
  for (const member of members) {
    const name = member.name.trim();
    if (name === '') {
      continue;
    }
    const owner = ownerByName.get(name);
    if (owner === undefined) {
      ownerByName.set(name, member.memberKey);
      continue;
    }
    issues.push(
      issue(
        'MEMBER_NAME_DUPLICATE',
        'WARNING',
        { area: 'MEMBER', memberKey: member.memberKey, field: 'name' },
        `회원 이름 ${name}이 회원 ${owner}와 같습니다. 필요하면 ID를 입력해 구분합니다.`,
      ),
    );
  }
}

export function validateProjectSetupDraft(
  draft: ProjectSetupDraft,
): ProjectSetupValidation {
  const issues: ProjectSetupIssue[] = [];
  validatePeriodFields(draft, issues);
  const topology = deriveTopology(draft);
  const root =
    draft.rootMemberKey === null
      ? undefined
      : topology.memberByKey.get(draft.rootMemberKey);
  if (root === undefined) {
    issues.push(
      issue(
        'SELECTED_ROOT_INVALID',
        'ERROR',
        { area: 'PROJECT', field: 'rootMemberKey' },
        '최상위 회원을 한 명 정해 주세요.',
      ),
    );
  }

  for (const member of topology.activeMembers) {
    validateMember(member, member.memberKey === draft.rootMemberKey, issues);
  }
  validateDuplicateNames(topology.activeMembers, issues);

  for (const entry of topology.reassignmentQueue) {
    issues.push(
      issue(
        'REASSIGNMENT_REQUIRED',
        'ERROR',
        { area: 'QUEUE', memberKey: entry.memberKey, field: 'parentMemberKey' },
        `${entry.memberName || entry.memberKey}님과 아래 회원들의 새 위치를 정해 주세요.`,
        '조직도에 비어 있는 자리에 연결하거나, 최상위 회원으로 정해 주세요.',
      ),
    );
  }

  return createProjectSetupValidation(issues, topology.reassignmentQueue);
}
