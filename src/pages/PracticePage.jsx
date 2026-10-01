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

/** 문항 고르는 버튼 줄. 눌린 문항이 `aria-pressed` 로 드러난다. */
function Picker({ items, activeId, onPick, labelOf }) {
  return (
    <div className="practice-picker" role="group" aria-label="문항 선택">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`btn-outline${item.id === activeId ? ' active' : ''}`}
          aria-pressed={item.id === activeId}
          onClick={() => onPick(item.id)}
        >
          {labelOf(item)}
        </button>
      ))}
    </div>
  );
}

function TracePanel() {
  const [problems, setProblems] = useState([]);
  const [activeId, setActiveId] = useState(Object.keys(TRACES)[0]);

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
      <Picker items={problems} activeId={active.id} onPick={setActiveId} labelOf={(p) => p.id} />
      <h2 className="practice-title">{active.id}. {active.title}</h2>
      <CodeTracingTable key={active.id} code={active.code} lang={active.lang} steps={traceFor(active.id).steps} />
    </>
  );
}

function SqlPanel() {
  const [activeId, setActiveId] = useState(SQL_BLANK_ITEMS[0].id);
  const item = SQL_BLANK_ITEMS.find((i) => i.id === activeId) ?? SQL_BLANK_ITEMS[0];
  return (
    <>
      <Picker items={SQL_BLANK_ITEMS} activeId={item.id} onPick={setActiveId} labelOf={(i) => i.id} />
      <SqlQuizCard key={item.id} item={item} />
    </>
  );
}

function ShortPanel() {
  const [activeId, setActiveId] = useState(SHORT_ANSWER_ITEMS[0].id);
  const item = SHORT_ANSWER_ITEMS.find((i) => i.id === activeId) ?? SHORT_ANSWER_ITEMS[0];
  return (
    <>
      <Picker items={SHORT_ANSWER_ITEMS} activeId={item.id} onPick={setActiveId} labelOf={(i) => shortLabel(i.question)} />
      <ShortAnswerGrader key={item.id} item={item} />
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
