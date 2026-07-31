import type { ProjectSetupBundle } from '../project-setup';
import { deriveManualPlanSchema } from './derive-manual-plan-schema';
import type {
  ManualPlanCellDraft,
  ManualPlanDraft,
  ManualPlanMemberDescriptor,
} from './types';

function createCell(
  date: string,
  isSkipped: boolean,
  member: ManualPlanMemberDescriptor,
): ManualPlanCellDraft {
  const initialValue = isSkipped ? '0' : '';
  return Object.freeze({
    date,
    memberKey: member.memberKey,
    pvp: initialValue,
    ...(member.leftMode === 'SELF' ? { selfLeft: initialValue } : {}),
    ...(member.rightMode === 'SELF' ? { selfRight: initialValue } : {}),
  });
}

export function createManualPlanDraft(bundle: ProjectSetupBundle): ManualPlanDraft {
  const schema = deriveManualPlanSchema(bundle);
  const cells = schema.dates.flatMap((date) =>
    schema.members.map((member) =>
      createCell(date.date, date.settlementMode === 'SKIP_NO_INPUT', member),
    ),
  );
  return Object.freeze({
    cells: Object.freeze(cells),
    actualDifferenceMarkers: Object.freeze([]),
  });
}
