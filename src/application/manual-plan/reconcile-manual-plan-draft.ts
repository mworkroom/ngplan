import type { ProjectSetupBundle } from '../project-setup';
import { createManualPlanDraft } from './create-manual-plan-draft';
import { manualPlanCellKey } from './derive-manual-plan-schema';
import type { ManualPlanCellDraft, ManualPlanDraft } from './types';

function keepString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function reconcileManualPlanDraft(
  bundle: ProjectSetupBundle,
  previous: ManualPlanDraft | null,
): ManualPlanDraft {
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
  return Object.freeze({ cells: Object.freeze(cells) });
}
