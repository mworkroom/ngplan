import {
  buildOrganizationIndex,
  derivePeriod,
  settlementModeForDate,
} from '../../engine';
import type { IsoDate, MemberSnapshot, OpeningStateInput } from '../../engine';
import type { ProjectSetupBundle } from '../project-setup';
import type {
  ManualPlanDateDescriptor,
  ManualPlanField,
  ManualPlanMemberDescriptor,
  ManualPlanSchema,
} from './types';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function encodeTuple(parts: readonly string[]): string {
  return encodeURIComponent(JSON.stringify(parts));
}

export function manualPlanCellKey(date: string, memberKey: string): string {
  return encodeTuple(['CELL', date, memberKey]);
}

export function manualPlanCellDomId(date: string, memberKey: string): string {
  return `manual-plan-cell-${encodeTuple([date, memberKey])}`;
}

export function manualPlanFieldDomId(
  date: string,
  memberKey: string,
  field: ManualPlanField,
): string {
  return `manual-plan-field-${encodeTuple([date, memberKey, field])}`;
}

export function manualPlanMemberGroupDomId(memberKey: string): string {
  return `manual-plan-member-${encodeTuple([memberKey])}`;
}

export function manualPlanDateHeaderDomId(date: string): string {
  return `manual-plan-date-${encodeTuple([date])}`;
}

export function manualPlanColumnHeaderDomId(
  memberKey: string,
  field: ManualPlanField,
): string {
  return `manual-plan-column-${encodeTuple([memberKey, field])}`;
}

function createDateDescriptor(date: string): ManualPlanDateDescriptor {
  const [yearText, monthText, dayText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const weekday = WEEKDAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!;

  return Object.freeze({
    date,
    displayLabel: `${month}월 ${day}일 (${weekday})`,
    weekdayLabel: weekday,
    settlementMode: settlementModeForDate(date as IsoDate),
  });
}

function findRoot(members: readonly MemberSnapshot[]): MemberSnapshot {
  const roots = members.filter(
    (member) => member.parentMemberKey === null && member.sideAtParent === null,
  );
  if (roots.length !== 1) {
    throw new Error('계획표를 만들려면 맨 위 회원이 한 명 있어야 합니다.');
  }
  return roots[0]!;
}

function preorderMembers(members: readonly MemberSnapshot[]): readonly MemberSnapshot[] {
  const root = findRoot(members);
  const organization = buildOrganizationIndex(members);
  const ordered: MemberSnapshot[] = [];
  const stack = [root.memberKey];

  while (stack.length > 0) {
    const memberKey = stack.pop()!;
    const member = organization.membersByKey.get(memberKey)!;
    ordered.push(member);

    const children = organization.childrenByMemberKey.get(memberKey)!;
    if (children.right !== null) {
      stack.push(children.right);
    }
    if (children.left !== null) {
      stack.push(children.left);
    }
  }

  if (ordered.length !== members.length) {
    throw new Error('모든 회원을 맨 위 회원부터 이어지는 조직 그림에 연결해 주세요.');
  }
  return ordered;
}

function visibleIdentityKey(member: MemberSnapshot): string {
  return JSON.stringify([member.name, member.memberId]);
}

function markedName(member: MemberSnapshot): string {
  const number =
    member.sheetMarker === 'PINK_1'
      ? '1'
      : member.sheetMarker === 'GREEN_2'
        ? '2'
        : member.sheetMarker === 'BLUE_3'
          ? '3'
          : null;
  return number === null ? member.name : `${number}. ${member.name}`;
}

function openingFor(
  bundle: ProjectSetupBundle,
  memberKey: string,
): OpeningStateInput {
  if (!Object.hasOwn(bundle.organization.openingStateByMember, memberKey)) {
    throw new Error(`수동 계획표 회원 ${memberKey}의 시작값이 없습니다.`);
  }
  const opening = bundle.organization.openingStateByMember[memberKey];
  if (opening === undefined) {
    throw new Error(`수동 계획표 회원 ${memberKey}의 시작값이 없습니다.`);
  }
  return opening;
}

function createMemberDescriptors(
  bundle: ProjectSetupBundle,
  orderedMembers: readonly MemberSnapshot[],
): readonly ManualPlanMemberDescriptor[] {
  const organization = buildOrganizationIndex(bundle.organization.members);
  const identityCounts = new Map<string, number>();
  for (const member of orderedMembers) {
    const key = visibleIdentityKey(member);
    identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1);
  }
  const identityOrdinals = new Map<string, number>();

  return orderedMembers.map((member) => {
    const children = organization.childrenByMemberKey.get(member.memberKey)!;
    const identityKey = visibleIdentityKey(member);
    const duplicateCount = identityCounts.get(identityKey) ?? 0;
    const duplicateOrdinal = (identityOrdinals.get(identityKey) ?? 0) + 1;
    identityOrdinals.set(identityKey, duplicateOrdinal);
    const duplicateLabel = duplicateCount > 1 ? `동명이인 ${duplicateOrdinal}` : null;
    const memberId = member.memberId === '' ? null : member.memberId;
    const displayLabel = [
      markedName(member),
      memberId === null ? null : `회원 ID ${memberId}`,
      duplicateLabel,
    ]
      .filter((part): part is string => part !== null)
      .join(' · ');

    return Object.freeze({
      memberKey: member.memberKey,
      name: member.name,
      memberId,
      displayLabel,
      duplicateLabel,
      pvpTarget: member.pvpTarget,
      sheetMarker: member.sheetMarker,
      openingState: openingFor(bundle, member.memberKey),
      leftMode: children.left === null ? 'SELF' : 'CHILD',
      rightMode: children.right === null ? 'SELF' : 'CHILD',
      leftChildMemberKey: children.left,
      rightChildMemberKey: children.right,
    });
  });
}

export function deriveManualPlanSchema(bundle: ProjectSetupBundle): ManualPlanSchema {
  const derivedPeriod = derivePeriod(bundle.project.period);
  const period = Object.freeze({
    ...derivedPeriod,
    dates: Object.freeze([...derivedPeriod.dates]),
  });
  const orderedMembers = preorderMembers(bundle.organization.members);
  const members = Object.freeze(createMemberDescriptors(bundle, orderedMembers));
  const dates = Object.freeze(period.dates.map(createDateDescriptor));
  const memberByKey = new Map(members.map((member) => [member.memberKey, member] as const));
  const dateByIso = new Map(dates.map((date) => [date.date, date] as const));
  const cellIndexByKey = new Map<string, number>();
  let index = 0;
  for (const date of dates) {
    for (const member of members) {
      cellIndexByKey.set(manualPlanCellKey(date.date, member.memberKey), index);
      index += 1;
    }
  }

  return Object.freeze({
    period,
    rootMemberKey: orderedMembers[0]!.memberKey,
    dates,
    members,
    memberByKey: Object.freeze(memberByKey),
    dateByIso: Object.freeze(dateByIso),
    cellIndexByKey: Object.freeze(cellIndexByKey),
  });
}
