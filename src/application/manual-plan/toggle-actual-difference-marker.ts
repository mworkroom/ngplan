import { manualPlanCellKey } from './derive-manual-plan-schema';
import type {
  ManualPlanActualDifferenceMarker,
  ManualPlanDraft,
  ManualPlanSchema,
} from './types';

export function hasManualPlanActualDifference(
  draft: ManualPlanDraft,
  date: string,
  memberKey: string,
): boolean {
  return (draft.actualDifferenceMarkers ?? []).some(
    (marker) => marker.date === date && marker.memberKey === memberKey,
  );
}

export function toggleManualPlanActualDifference(
  schema: ManualPlanSchema,
  draft: ManualPlanDraft,
  date: string,
  memberKey: string,
): ManualPlanDraft {
  const dateDescriptor = schema.dateByIso.get(date);
  if (
    dateDescriptor?.settlementMode !== 'SETTLE' ||
    !schema.memberByKey.has(memberKey)
  ) {
    return draft;
  }

  const targetKey = manualPlanCellKey(date, memberKey);
  const current = draft.actualDifferenceMarkers ?? [];
  const marked = current.some(
    (marker) => manualPlanCellKey(marker.date, marker.memberKey) === targetKey,
  );
  const next: readonly ManualPlanActualDifferenceMarker[] = marked
    ? current.filter(
        (marker) => manualPlanCellKey(marker.date, marker.memberKey) !== targetKey,
      )
    : [
        ...current,
        Object.freeze({ date, memberKey }),
      ];

  return Object.freeze({
    ...draft,
    actualDifferenceMarkers: Object.freeze(next),
  });
}
