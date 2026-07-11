import {
  childSlotId,
  type ChildSlotState,
} from '../../application/project-setup';

type Side = ChildSlotState['side'];

const SIDE_LABEL: Readonly<Record<Side, string>> = {
  LEFT: '왼쪽',
  RIGHT: '오른쪽',
};

export interface ChildSlotProps {
  readonly slot: ChildSlotState;
  readonly parentName: string;
  readonly childName: string | null;
  readonly onOpen: () => void;
  readonly onRemoveChild: (memberKey: string) => void;
}

export function ChildSlot({
  slot,
  parentName,
  childName,
  onOpen,
  onRemoveChild,
}: ChildSlotProps) {
  const sideLabel = SIDE_LABEL[slot.side];
  return (
    <div
      id={childSlotId(slot.parentMemberKey, slot.side)}
      className="child-slot"
      tabIndex={-1}
    >
      {slot.kind === 'SELF' ? (
        <>
          <span className="child-slot__state">스스로</span>
          <button
            type="button"
            className="child-slot__action"
            aria-label={`${parentName}의 ${sideLabel} 빈 자리에 회원 연결`}
            onClick={onOpen}
          >
            +
          </button>
        </>
      ) : (
        <button
          type="button"
          className="child-slot__action child-slot__action--remove"
          aria-label={`${childName ?? slot.childMemberKey ?? '아래 회원'} 위치 바꾸기 또는 명단에서 빼기`}
          title={`${childName ?? slot.childMemberKey ?? '아래 회원'} 위치 바꾸기 또는 명단에서 빼기`}
          onClick={() => {
            if (slot.childMemberKey !== null) {
              onRemoveChild(slot.childMemberKey);
            }
          }}
        >
          −
        </button>
      )}
    </div>
  );
}
