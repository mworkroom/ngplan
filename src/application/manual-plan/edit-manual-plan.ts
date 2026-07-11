import { manualPlanCellKey } from './derive-manual-plan-schema';
import type {
  ManualPlanCellDraft,
  ManualPlanDraft,
  ManualPlanEditOutcome,
  ManualPlanEditRequest,
  ManualPlanSchema,
} from './types';

function reject(
  draft: ManualPlanDraft,
  code: Extract<ManualPlanEditOutcome, { status: 'REJECTED' }>['code'],
  message: string,
): ManualPlanEditOutcome {
  return Object.freeze({ status: 'REJECTED', draft, code, message });
}

function replaceField(
  cell: ManualPlanCellDraft,
  request: ManualPlanEditRequest,
): ManualPlanCellDraft {
  return Object.freeze({ ...cell, [request.field]: request.value });
}

export function editManualPlanField(
  schema: ManualPlanSchema,
  draft: ManualPlanDraft,
  request: ManualPlanEditRequest,
): ManualPlanEditOutcome {
  const key = manualPlanCellKey(request.date, request.memberKey);
  const cellIndex = schema.cellIndexByKey.get(key);
  const cell = cellIndex === undefined ? undefined : draft.cells[cellIndex];
  const date = schema.dateByIso.get(request.date);
  const member = schema.memberByKey.get(request.memberKey);

  if (
    cellIndex === undefined ||
    cell === undefined ||
    date === undefined ||
    member === undefined ||
    cell.date !== request.date ||
    cell.memberKey !== request.memberKey
  ) {
    return reject(draft, 'CELL_NOT_FOUND', '수정할 날짜·회원 계획 셀을 찾을 수 없습니다.');
  }
  if (date.settlementMode === 'SKIP_NO_INPUT') {
    return reject(draft, 'SKIPPED_DATE_LOCKED', '일요일 계획 셀은 0으로 잠겨 있습니다.');
  }
  const fieldEditable =
    request.field === 'pvp' ||
    (request.field === 'selfLeft' && member.leftMode === 'SELF') ||
    (request.field === 'selfRight' && member.rightMode === 'SELF');
  if (!fieldEditable || !Object.hasOwn(cell, request.field)) {
    return reject(
      draft,
      'FIELD_NOT_EDITABLE',
      '하위 회원이 연결된 방향은 조직 합계이므로 직접 수정할 수 없습니다.',
    );
  }
  if (cell[request.field] === request.value) {
    return Object.freeze({ status: 'SUCCESS', draft });
  }

  const cells = [...draft.cells];
  cells[cellIndex] = replaceField(cell, request);
  return Object.freeze({
    status: 'SUCCESS',
    draft: Object.freeze({ cells: Object.freeze(cells) }),
  });
}
