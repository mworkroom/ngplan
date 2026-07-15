import { DEFAULT_RULE_SET } from '../../engine';
import type {
  ManualPlanAchievementTargets,
  ManualPlanSchema,
} from './types';

function targetTotal(targets: ManualPlanAchievementTargets): number {
  return targets.pvp + targets.selfLeft + targets.selfRight;
}

export function deriveManualPlanAchievementTargets(
  schema: ManualPlanSchema,
): ReadonlyMap<string, ManualPlanAchievementTargets> {
  const targetsByMember = new Map<string, ManualPlanAchievementTargets>();
  const visiting = new Set<string>();

  const derive = (memberKey: string): ManualPlanAchievementTargets => {
    const cached = targetsByMember.get(memberKey);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(memberKey)) {
      throw new Error('달성 목표를 계산할 수 없는 조직 순환이 있습니다.');
    }
    const member = schema.memberByKey.get(memberKey);
    if (member === undefined) {
      throw new Error('달성 목표를 계산할 회원을 찾을 수 없습니다.');
    }

    visiting.add(memberKey);
    const leftChildTargets =
      member.leftChildMemberKey === null
        ? null
        : derive(member.leftChildMemberKey);
    const rightChildTargets =
      member.rightChildMemberKey === null
        ? null
        : derive(member.rightChildMemberKey);
    const pvp = member.pvpTarget;
    let selfLeft =
      leftChildTargets === null
        ? DEFAULT_RULE_SET.fortnightSideTarget
        : targetTotal(leftChildTargets);
    let selfRight =
      rightChildTargets === null
        ? DEFAULT_RULE_SET.fortnightSideTarget
        : targetTotal(rightChildTargets);

    if (rightChildTargets === null) {
      selfRight = Math.max(0, selfRight - pvp);
    } else if (leftChildTargets === null) {
      selfLeft = Math.max(0, selfLeft - pvp);
    }

    const targets = Object.freeze({ pvp, selfLeft, selfRight });
    targetsByMember.set(memberKey, targets);
    visiting.delete(memberKey);
    return targets;
  };

  for (const member of schema.members) {
    derive(member.memberKey);
  }
  return targetsByMember;
}
