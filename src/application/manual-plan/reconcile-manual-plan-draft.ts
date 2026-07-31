import type { ProjectSetupBundle } from '../project-setup';
import { createManualPlanDraft } from './create-manual-plan-draft';
import {
  deriveManualPlanSchema,
  manualPlanCellKey,
} from './derive-manual-plan-schema';
import type {
  ManualPlanActualDifferenceMarker,
  ManualPlanCellDraft,
  ManualPlanDraft,
} from './types';

function keepString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function reconcileManualPlanDraft(
  bundle: ProjectSetupBundle,
  previous: ManualPlanDraft | null,
): ManualPlanDraft {
  const schema = deriveManualPlanSchema(bundle);
  const fresh = createManualPlanDraft(bundle);
  if (previous === null) {
    return fresh;
  }

  const previousByKey = new Map(
    previous.cells.map((cell) => [manualPlanCellKey(cell.date, cell.memberKey), cell]),
  );
  const cells = fresh.cells.map((cell): ManualPlanCellDraft => {
    const saved = previousByKey.get(manualPlanCellKey(cell.date, cell.memberKey));
    if (saved === undefined) {
      return cell;
    }
    return Object.freeze({
      date: cell.date,
      memberKey: cell.memberKey,
      pvp: keepString(saved.pvp, cell.pvp),
      ...(Object.hasOwn(cell, 'selfLeft')
        ? { selfLeft: keepString(saved.selfLeft, cell.selfLeft ?? '') }
        : {}),
      ...(Object.hasOwn(cell, 'selfRight')
        ? { selfRight: keepString(saved.selfRight, cell.selfRight ?? '') }
        : {}),
    });
  });
  const markerKeys = new Set<string>();
  const validCellKeys = new Set(
    fresh.cells.map((cell) => manualPlanCellKey(cell.date, cell.memberKey)),
  );
  const actualDifferenceMarkers = (previous.actualDifferenceMarkers ?? [])
    .filter((marker): marker is ManualPlanActualDifferenceMarker => {
      const date = schema.dateByIso.get(marker.date);
      const key = manualPlanCellKey(marker.date, marker.memberKey);
      if (
        date?.settlementMode !== 'SETTLE' ||
        !validCellKeys.has(key) ||
        markerKeys.has(key)
      ) {
        return false;
      }
      markerKeys.add(key);
      return true;
    })
    .map((marker) => Object.freeze({
      date: marker.date,
      memberKey: marker.memberKey,
    }));
  return Object.freeze({
    cells: Object.freeze(cells),
    actualDifferenceMarkers: Object.freeze(actualDifferenceMarkers),
  });
}
