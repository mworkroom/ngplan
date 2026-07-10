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
            재배치 대기 서브트리
          </h2>
          <p className="panel__description">
            내부 하위 연결은 보존되어 있습니다. 빈 좌·우 + 슬롯에서 연결해 주세요.
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
                서브트리 선택
              </button>
              {rootMissing ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => onSetRoot(entry.memberKey)}
                >
                  새 루트로 지정
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
