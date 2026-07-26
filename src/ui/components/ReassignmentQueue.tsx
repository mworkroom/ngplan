import {
  queueEntryId,
  type ReassignmentQueueEntry,
} from '../../application/project-setup';

export interface ReassignmentQueueProps {
  readonly entries: readonly ReassignmentQueueEntry[];
  readonly rootMissing: boolean;
  readonly selectedMemberKey?: string | null;
  readonly onSelect: (memberKey: string) => void;
  readonly onSetRoot: (memberKey: string) => void;
}

export function ReassignmentQueue({
  entries,
  rootMissing,
  selectedMemberKey = null,
  onSelect,
  onSetRoot,
}: ReassignmentQueueProps) {
  return (
    <section className="panel" aria-labelledby="reassignment-title">
      <div className="panel__header">
        <div>
          <h2 id="reassignment-title" className="panel__title">
            보관함에 있는 회원
          </h2>
          <p className="panel__description">
            다시 넣으려면 조직도에서 원하는 빈 자리의 + 버튼을 누르세요.
          </p>
        </div>
        <span className="status-badge status-badge--warning">
          {entries.length}명
        </span>
      </div>

      <ul className="reassignment-queue">
        {entries.map((entry) => {
          const displayName = entry.memberName.trim() || entry.memberKey;
          return (
            <li
              id={queueEntryId(entry.memberKey)}
              className="reassignment-queue__item"
              key={entry.memberKey}
              tabIndex={-1}
            >
              <button
                type="button"
                className="reassignment-queue__select"
                aria-label={`${displayName} 정보 보기`}
                aria-pressed={entry.memberKey === selectedMemberKey}
                onClick={() => onSelect(entry.memberKey)}
              >
                <strong>{displayName}</strong>
                <span className="help-text">{entry.message}</span>
              </button>
              {rootMissing ? (
                <div className="reassignment-queue__actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => onSetRoot(entry.memberKey)}
                  >
                    맨 위 회원으로 정하기
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
