import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CodeTracingTable from '../components/CodeTracingTable';
import ShortAnswerGrader from '../components/ShortAnswerGrader';
import SqlQuizCard from '../components/SqlQuizCard';
import { SHORT_ANSWER_ITEMS } from '../domain/shortAnswer';
import { SQL_BLANK_ITEMS } from '../domain/sqlBlanks';
import { TRACES, traceFor } from '../domain/traces';
import { parseCodeDrill } from '../utils/parseCodeDrill';
import { fetchMarkdown } from '../utils/mdCache';
import useStudyTimer from '../hooks/useStudyTimer';
import ProgressNav from '../components/ProgressNav';
import { ITEM_STATUS } from '../domain/progressNav';
import { loadProgress, saveProgress } from '../utils/storage';

/**
 * 실기 연습의 문항별 결과 저장 키 — { trace: {id: 'viewed'|'done'|'wrong'}, sql: {...}, short: {...} }
 * 'viewed' 는 추적표를 끝까지 넘겨 본 것(완료로 표시하지만 정답률에는 넣지 않는다), 'done'·'wrong' 은 채점 결과다.
 */
export const PRACTICE_PROGRESS_KEY = 'practice_done';

const TABS = [
  { key: 'trace', label: '변수 추적표' },
  { key: 'sql', label: 'SQL 빈칸' },
  { key: 'short', label: '단답 채점' },
];

/** `?tab=` 이 알려진 값이 아니면 첫 탭으로 연다 — 로드맵 링크가 탭을 지정한다 */
function tabFromParam(raw) {
  return TABS.some((t) => t.key === raw) ? raw : TABS[0].key;
}

/** 단답 문항의 버튼 이름 — "~을 쓰시오." 를 떼고 길면 줄인다. 분야만 쓰면 같은 이름이 여러 개라 구분이 안 된다. */
function shortLabel(question) {
  const text = question.replace(/(을|를)?\s*쓰시오\.?$/, '').trim();
  return text.length > 20 ? `${text.slice(0, 20)}…` : text;
}

/**
 * 탭 하나의 문항별 결과. 마지막 결과가 남는다(다시 풀어 맞히면 오답 → 완료).
 * @param {'trace'|'sql'|'short'} tab
 */
function usePracticeProgress(tab) {
  const [all, setAll] = useState(() => loadProgress(PRACTICE_PROGRESS_KEY, {}) ?? {});
  const byId = all[tab] ?? {};
  const statusOf = (item) => {
    const r = byId[item.id];
    return r === 'done' || r === 'viewed' ? ITEM_STATUS.DONE : r === 'wrong' ? ITEM_STATUS.WRONG : ITEM_STATUS.TODO;
  };
  const record = (id, status) => {
    setAll((prev) => {
      // 끝까지 넘겨 본 것('viewed')으로 채점 결과를 덮지 않는다
      if (status === 'viewed' && (prev[tab]?.[id] === 'done' || prev[tab]?.[id] === 'wrong')) return prev;
      const next = { ...prev, [tab]: { ...(prev[tab] ?? {}), [id]: status } };
      saveProgress(PRACTICE_PROGRESS_KEY, next);
      return next;
    });
  };
  /** 처음 열 문항 — 아직 안 한 첫 문항, 다 했으면 첫 문항 */
  const firstTodoId = (items) => (items.find((i) => !byId[i.id]) ?? items[0])?.id;
  return { statusOf, record, firstTodoId };
}

/** 문항 번호판 — 완료 · 오답 · 미완료가 칩으로 보이고 "다음 미완료"로 넘어간다 */
function Picker({ items, activeId, onPick, labelOf, statusOf }) {
  const index = Math.max(items.findIndex((i) => i.id === activeId), 0);
  return (
    <ProgressNav
      items={items}
      index={index}
      statusOf={statusOf}
      onPick={(i) => onPick(items[i].id)}
      labelOf={labelOf}
    />
  );
}

function TracePanel() {
  const [problems, setProblems] = useState([]);
  const progress = usePracticeProgress('trace');
  const [activeId, setActiveId] = useState(() => progress.firstTodoId(Object.keys(TRACES).map((id) => ({ id }))));

  useEffect(() => {
    let cancelled = false;
    fetchMarkdown('정처기_코드트레이싱_드릴.md').then((md) => {
      if (cancelled) return;
      // 추적표 데이터가 있는 문제만 보여준다
      setProblems(parseCodeDrill(md).filter((p) => traceFor(p.id)));
    });
    return () => { cancelled = true; };
  }, []);

  const active = problems.find((p) => p.id === activeId) ?? problems[0];
  if (!active) return <div className="card" style={{ textAlign: 'center', padding: 40 }}>문제를 불러오는 중...</div>;

  return (
    <>
      <Picker items={problems} activeId={active.id} onPick={setActiveId} labelOf={(p) => p.id} statusOf={progress.statusOf} />
      <h2 className="practice-title">{active.id}. {active.title}</h2>
      <CodeTracingTable
        key={active.id}
        code={active.code}
        lang={active.lang}
        steps={traceFor(active.id).steps}
        onComplete={(status) => progress.record(active.id, status)}
      />
    </>
  );
}

function SqlPanel() {
  const progress = usePracticeProgress('sql');
  const [activeId, setActiveId] = useState(() => progress.firstTodoId(SQL_BLANK_ITEMS));
  const item = SQL_BLANK_ITEMS.find((i) => i.id === activeId) ?? SQL_BLANK_ITEMS[0];
  return (
    <>
      <Picker items={SQL_BLANK_ITEMS} activeId={item.id} onPick={setActiveId} labelOf={(i) => i.id} statusOf={progress.statusOf} />
      <SqlQuizCard key={item.id} item={item} onComplete={(status) => progress.record(item.id, status)} />
    </>
  );
}

function ShortPanel() {
  const progress = usePracticeProgress('short');
  const [activeId, setActiveId] = useState(() => progress.firstTodoId(SHORT_ANSWER_ITEMS));
  const item = SHORT_ANSWER_ITEMS.find((i) => i.id === activeId) ?? SHORT_ANSWER_ITEMS[0];
  return (
    <>
      <Picker items={SHORT_ANSWER_ITEMS} activeId={item.id} onPick={setActiveId} labelOf={(i) => shortLabel(i.question)} statusOf={progress.statusOf} />
      <ShortAnswerGrader key={item.id} item={item} onComplete={(status) => progress.record(item.id, status)} />
    </>
  );
}

export default function PracticePage() {
  useStudyTimer();
  const [searchParams] = useSearchParams();
  // 첫 렌더에만 URL 을 읽는다 — 이후 탭 선택은 사용자 조작이 소유한다
  const [tab, setTab] = useState(() => tabFromParam(searchParams.get('tab')));

  return (
    <div className="page">
      <h1>실기 연습</h1>
      <p className="subtitle">변수 추적표 · SQL 빈칸 채우기 · 단답·약술 키워드 채점</p>

      <div className="practice-tabs" role="tablist" aria-label="연습 종류">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`btn-outline${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'trace' ? <TracePanel /> : null}
        {tab === 'sql' ? <SqlPanel /> : null}
        {tab === 'short' ? <ShortPanel /> : null}
      </div>
    </div>
  );
}
