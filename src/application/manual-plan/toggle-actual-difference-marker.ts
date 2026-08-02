import { manualPlanCellKey } from './derive-manual-plan-schema';
import type {
  ManualPlanDraft,
  ManualPlanMarkerKind,
  ManualPlanSchema,
} from './types';

export function manualPlanMarkerKind(
  draft: ManualPlanDraft,
  date: string,
  memberKey: string,
): ManualPlanMarkerKind | null {
  if (hasManualPlanActualDifference(draft, date, memberKey)) {
    return 'ACTUAL_DIFFERENCE';
  }
  return hasManualPlanReminder(draft, date, memberKey) ? 'REMINDER' : null;
}

export function hasManualPlanActualDifference(
  draft: ManualPlanDraft,
  date: string,
  memberKey: string,
): boolean {
  return (draft.actualDifferenceMarkers ?? []).some(
    (marker) => marker.date === date && marker.memberKey === memberKey,
  );
}

export function hasManualPlanReminder(
  draft: ManualPlanDraft,
  date: string,
  memberKey: string,
): boolean {
  return (draft.reminderMarkers ?? []).some(
    (marker) => marker.date === date && marker.memberKey === memberKey,
  );
}

export function setManualPlanMarker(
  schema: ManualPlanSchema,
  draft: ManualPlanDraft,
  date: string,
  memberKey: string,
  markerKind: ManualPlanMarkerKind | null,
): ManualPlanDraft {
  const dateDescriptor = schema.dateByIso.get(date);
  const actualDifferenceMarked = hasManualPlanActualDifference(draft, date, memberKey);
  const reminderMarked = hasManualPlanReminder(draft, date, memberKey);
  const alreadyMatches = markerKind === 'ACTUAL_DIFFERENCE'
    ? actualDifferenceMarked && !reminderMarked
    : markerKind === 'REMINDER'
      ? reminderMarked && !actualDifferenceMarked
      : !actualDifferenceMarked && !reminderMarked;
  if (
    dateDescriptor?.settlementMode !== 'SETTLE' ||
    !schema.memberByKey.has(memberKey) ||
    alreadyMatches
  ) {
    return draft;
  }

  const targetKey = manualPlanCellKey(date, memberKey);
  const withoutTarget = <T extends { readonly date: string; readonly memberKey: string }>(
    markers: readonly T[],
  ): readonly T[] => markers.filter(
    (marker) => manualPlanCellKey(marker.date, marker.memberKey) !== targetKey,
  );
  const actualDifferenceMarkers = withoutTarget(draft.actualDifferenceMarkers ?? []);
  const reminderMarkers = withoutTarget(draft.reminderMarkers ?? []);

  return Object.freeze({
    ...draft,
    actualDifferenceMarkers: Object.freeze(
      markerKind === 'ACTUAL_DIFFERENCE'
        ? [...actualDifferenceMarkers, Object.freeze({ date, memberKey })]
        : actualDifferenceMarkers,
    ),
    reminderMarkers: Object.freeze(
      markerKind === 'REMINDER'
        ? [...reminderMarkers, Object.freeze({ date, memberKey })]
        : reminderMarkers,
    ),
  });
}

export function toggleManualPlanActualDifference(
  schema: ManualPlanSchema,
  draft: ManualPlanDraft,
  date: string,
  memberKey: string,
): ManualPlanDraft {
  return setManualPlanMarker(
    schema,
    draft,
    date,
    memberKey,
    hasManualPlanActualDifference(draft, date, memberKey)
      ? null
      : 'ACTUAL_DIFFERENCE',
  );
}
