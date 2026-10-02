import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MarkdownViewer from '../components/MarkdownViewer';
import BookmarkButton from '../components/ui/BookmarkButton';
import { BOOKMARK_TYPE } from '../domain/bookmarks';
import useStudyState from '../hooks/useStudyState';
import useStudyTimer from '../hooks/useStudyTimer';
import { fetchMarkdown } from '../utils/mdCache';
import { STUDY_FILES as FILES } from '../domain/studyFiles';
import { buildDailyPlan, plannedEntryForDay } from '../domain/dailyPlan';
import { getExamDate, loadProgress, toLocalDateKey } from '../utils/storage';

// `/study?day=6` → FILES 인덱스. Day N 은 FILES[N-1] 이다.
// 오늘의 계획 카드의 study_day 항목이 이 경로로 들어온다.
function indexForDayParam(raw) {
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1 || day > 14) return 0;
  return day - 1;
}

// `/study?doc=15` → FILES 인덱스 그대로. 검색 결과가 Day 가 아닌 문서(보강·합격전략)로 보낼 때 쓴다.
function indexForDocParam(raw) {
  // 파라미터가 없을 때 Number(null) === 0 이 첫 문서로 읽히지 않도록 먼저 거른다
  if (raw === null || raw === '') return null;
  const idx = Number(raw);
  return Number.isInteger(idx) && idx >= 0 && idx < FILES.length ? idx : null;
}

/** 'YYYY-MM-DD' → 'M/D(요일)' (UTC 해석이라 시간대에 흔들리지 않는다) */
function formatPlannedDate(dateKey) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()]})`;
}

export default function StudyPage() {
  useStudyTimer();
  const [searchParams] = useSearchParams();
  const study = useStudyState();
  // 첫 렌더에만 URL 을 읽는다 — 이후 선택은 사용자 조작이 소유한다.
  // effect 로 동기화하지 않으므로 set-state-in-effect 가 생기지 않는다.
  const [selectedIdx, setSelectedIdx] = useState(
    () => indexForDocParam(searchParams.get('doc')) ?? indexForDayParam(searchParams.get('day'))
  );
  // 로드 결과에 해당 인덱스를 함께 담아 loading/content 를 파생 상태로 계산한다
  const [loaded, setLoaded] = useState({ idx: -1, text: '' });
  const loading = loaded.idx !== selectedIdx;
  const content = loading ? '' : loaded.text;

  // 이 Day 가 일정의 어느 날에 배정됐는지 — 문서 안에 날짜를 박아 두면 일정이 바뀔 때 어긋난다.
  // 렌더마다 다시 계산하지 않도록 한 번만 읽는다(체크 변경은 대시보드에서 일어나고 이 화면은 새로 열린다).
  const [plan] = useState(() =>
    buildDailyPlan({
      examDate: getExamDate(),
      today: toLocalDateKey(),
      dayChecks: loadProgress('day_checks', {}) || {},
    })
  );
  const planned = selectedIdx < 14 ? plannedEntryForDay(plan, selectedIdx + 1) : null;
  const dayDone = selectedIdx < 14 && !!(loadProgress('day_checks', {}) || {})[selectedIdx + 1];

  useEffect(() => {
    let cancelled = false;
    fetchMarkdown(FILES[selectedIdx].file)
      .then((text) => {
        if (cancelled) return;
        setLoaded({ idx: selectedIdx, text });
        window.scrollTo(0, 0);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded({ idx: selectedIdx, text: '파일을 불러올 수 없습니다.' });
      });
    return () => { cancelled = true; };
  }, [selectedIdx]);

  return (
    <div className="page">
      <h1>학습 노트</h1>
      <p className="subtitle">Day 1~14 학습 자료 + 보강 자료 뷰어</p>

      <div className="layout-with-sidebar">
        <aside className="sidebar" role="tablist" aria-label="학습 주제">
          {FILES.map((f, i) => (
            <div
              key={i}
              className={`sidebar-item ${i === selectedIdx ? 'active' : ''}`}
              onClick={() => setSelectedIdx(i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedIdx(i); } }}
              role="tab"
              tabIndex={0}
              aria-selected={i === selectedIdx}
            >
              {f.name}
            </div>
          ))}
        </aside>

        <div className="main-content" role="tabpanel">
          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              불러오는 중...
            </div>
          ) : (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <BookmarkButton
                  active={study.isBookmarked(BOOKMARK_TYPE.DOC, FILES[selectedIdx].file)}
                  onToggle={() => study.toggleBookmark(BOOKMARK_TYPE.DOC, FILES[selectedIdx].file)}
                  label={`${FILES[selectedIdx].name} 북마크`}
                />
              </div>
              {selectedIdx < 14 ? (
                <p className="study-planned" role="note">
                  {dayDone
                    ? '완료한 Day 입니다.'
                    : planned
                      ? `예정일 ${formatPlannedDate(planned.date)} · ${planned.dDay === 0 ? 'D-Day' : `D-${planned.dDay}`} (시험일 ${plan.examDate?.replace(/-/g, '.')} 기준 자동 배정)`
                      : '남은 일정에 배정된 날짜가 없습니다. 대시보드에서 시험일을 확인하세요.'}
                </p>
              ) : null}
              <MarkdownViewer content={content} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
