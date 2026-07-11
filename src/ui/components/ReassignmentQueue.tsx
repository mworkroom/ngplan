import {
  queueEntryId,
  type ReassignmentQueueEntry,
} from '../../application/project-setup';

export interface ReassignmentQueueProps {
  readonly entries: readonly ReassignmentQueueEntry[];
  readonly rootMissing: boolean;
  readonly onSelect: (memberKey: string) => void;
  readonly onSetRoot: (memberKey: string) => void;
}

export function ReassignmentQueue({
  entries,
  rootMissing,
  onSelect,
  onSetRoot,
}: ReassignmentQueueProps) {
  return (
    <section className="panel" aria-labelledby="reassignment-title">
      <div className="panel__header">
        <div>
          <h2 id="reassignment-title" className="panel__title">
            새 위치를 정해야 하는 회원
          </h2>
          <p className="panel__description">
            아래에 연결된 회원들은 그대로 유지됩니다. 조직도의 비어있는 자리에서 다시 연결해 주세요.
          </p>
        </div>
        <span className="status-badge status-badge--warning">
          {entries.length}개 대기
        </span>
      </div>

      <ul className="reassignment-queue">
        {entries.map((entry) => (
          <li
            id={queueEntryId(entry.memberKey)}
            className="reassignment-queue__item"
            key={entry.memberKey}
            tabIndex={-1}
          >
            <div>
              <strong>{entry.memberName.trim() || entry.memberKey}</strong>
              <p className="help-text">{entry.message}</p>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => onSelect(entry.memberKey)}
              >
                회원 정보 보기
              </button>
              {rootMissing ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => onSetRoot(entry.memberKey)}
                >
                  맨 위 회원으로 정하기
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
