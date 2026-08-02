import { manualPlanCellKey } from './derive-manual-plan-schema';
import type {
  ManualPlanCellDraft,
  ManualPlanDraft,
  ManualPlanMemberDescriptor,
  ManualPlanSchema,
} from './types';

function cellMatchesInitialShape(
  cell: ManualPlanCellDraft,
  member: ManualPlanMemberDescriptor,
  initialValue: string,
): boolean {
  if (cell.pvp !== initialValue) {
    return false;
  }

  const hasLeft = Object.hasOwn(cell, 'selfLeft');
  if (member.leftMode === 'SELF') {
    if (!hasLeft || cell.selfLeft !== initialValue) {
      return false;
    }
  } else if (hasLeft) {
    return false;
  }

  const hasRight = Object.hasOwn(cell, 'selfRight');
  if (member.rightMode === 'SELF') {
    if (!hasRight || cell.selfRight !== initialValue) {
      return false;
    }
  } else if (hasRight) {
    return false;
  }

  return true;
}

export function isManualPlanDraftModified(
  schema: ManualPlanSchema,
  draft: ManualPlanDraft,
): boolean {
  if (
    (draft.actualDifferenceMarkers?.length ?? 0) > 0 ||
    (draft.reminderMarkers?.length ?? 0) > 0
  ) {
    return true;
  }
  if (draft.cells.length !== schema.dates.length * schema.members.length) {
    return true;
  }

  for (const date of schema.dates) {
    const initialValue = date.settlementMode === 'SKIP_NO_INPUT' ? '0' : '';
    for (const member of schema.members) {
      const index = schema.cellIndexByKey.get(
        manualPlanCellKey(date.date, member.memberKey),
      );
      const cell = index === undefined ? undefined : draft.cells[index];
      if (
        cell === undefined ||
        cell.date !== date.date ||
        cell.memberKey !== member.memberKey ||
        !cellMatchesInitialShape(cell, member, initialValue)
      ) {
        return true;
      }
    }
  }

  return false;
}
