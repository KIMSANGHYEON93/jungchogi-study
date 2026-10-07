import { ITEM_STATUS, countStatuses, nextPendingIndex } from '../domain/progressNav';

const DEFAULT_LABELS = { done: '완료', wrong: '오답', todo: '미완료' };
const MARK = { done: '✓', wrong: '✗', todo: '' };

/**
 * 문항 번호판 — 완료 · 오답 · 미완료를 칩 색과 기호로 구분하고,
 * "다음 미완료" 버튼으로 끝낸 문항을 건너뛰게 한다.
 *
 * @param {{
 *   items: object[],
 *   index: number,                      지금 보고 있는 위치
 *   statusOf: (item: object) => 'done'|'wrong'|'todo',
 *   onPick: (index: number) => void,
 *   labelOf?: (item: object) => string,
 *   labels?: {done: string, wrong: string, todo: string},
 *   pending?: string[],                 "다음 미완료"가 찾아갈 상태 (기본: 아직 안 한 것만)
 *   collapsible?: boolean,              문항이 많으면 번호판을 접어 둔다
 * }} props
 */
export default function ProgressNav({
  items,
  index,
  statusOf,
  onPick,
  labelOf = (item) => item.id,
  labels = DEFAULT_LABELS,
  pending = [ITEM_STATUS.TODO],
  collapsible = false,
}) {
  if (!items || items.length === 0) return null;
  const counts = countStatuses(items, statusOf);
  const isPending = (item) => pending.includes(statusOf(item));
  const next = nextPendingIndex(items, index, isPending);
  const remaining = items.filter(isPending).length;

  const grid = (
    <div className="pnav-grid" role="group" aria-label="문항 번호판">
      {items.map((item, i) => {
        const status = statusOf(item);
        const label = labelOf(item);
        return (
          <button
            key={item.id ?? i}
            type="button"
            className={`pnav-chip is-${status}${i === index ? ' is-current' : ''}`}
            aria-current={i === index ? 'true' : undefined}
            aria-label={`${label} ${labels[status]}`}
            title={`${label} · ${labels[status]}`}
            onClick={() => onPick(i)}
          >
            {MARK[status] ? <span className="pnav-mark" aria-hidden="true">{MARK[status]}</span> : null}
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="pnav">
      <div className="pnav-head">
        <p className="pnav-summary" role="status">
          <span className="pnav-count is-done">{labels.done} {counts.done}</span>
          {counts.wrong > 0 ? <span className="pnav-count is-wrong">{labels.wrong} {counts.wrong}</span> : null}
          <span className="pnav-count is-todo">{labels.todo} {counts.todo}</span>
        </p>
        <button
          type="button"
          className="btn-outline pnav-next"
          onClick={() => onPick(next)}
          disabled={next < 0}
        >
          {remaining === 0 ? '모두 완료' : next < 0 ? '남은 문항은 지금 이 문항' : '다음 미완료 ▶'}
        </button>
      </div>
      {collapsible ? (
        <details className="pnav-details">
          <summary>번호판 보기 ({items.length})</summary>
          {grid}
        </details>
      ) : grid}
    </div>
  );
}
