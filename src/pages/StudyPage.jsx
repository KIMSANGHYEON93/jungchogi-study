import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MarkdownViewer from '../components/MarkdownViewer';
import BookmarkButton from '../components/ui/BookmarkButton';
import { BOOKMARK_TYPE } from '../domain/bookmarks';
import useStudyState from '../hooks/useStudyState';
import useStudyTimer from '../hooks/useStudyTimer';
import { fetchMarkdown } from '../utils/mdCache';
import { STUDY_FILES as FILES } from '../domain/studyFiles';
import { buildRoadmap, daysForStudyDoc } from '../domain/roadmap';
import { getExamDate, toLocalDateKey } from '../utils/storage';
import { checklistItemsOf, getChecklist, setChecklistItem } from '../utils/studyChecklist';

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

  // 이 문서가 로드맵의 어느 일차에 들어 있는지 — 문서 안에 날짜를 박아 두면 시험일이 바뀔 때 어긋난다.
  const [today] = useState(() => toLocalDateKey());
  const roadmap = buildRoadmap({ examDate: getExamDate(), today, checks: study.checks });
  const planned = selectedIdx < 14 ? daysForStudyDoc(roadmap, selectedIdx + 1) : null;
  const plannedDone = planned !== null && planned.length > 0 && planned.every((d) => d.done);

  // 체크리스트 상태 — 문서마다 따로 저장한다. 다른 문서로 바꾸면 저장소에서 다시 읽는다(effect 없이).
  const file = FILES[selectedIdx].file;
  const [checkState, setCheckState] = useState(() => ({ file, checks: getChecklist(file), saveFailed: false }));
  const checks = checkState.file === file ? checkState.checks : getChecklist(file);
  const checkSaveFailed = checkState.file === file && checkState.saveFailed;
  const checklist = {
    isChecked: (item) => !!checks[item],
    onToggle: (item, on) => {
      const { checks: next, saved } = setChecklistItem(file, item, on);
      setCheckState({ file, checks: next, saveFailed: !saved });
    },
  };
  const items = loading ? [] : [...new Set(checklistItemsOf(content))];
  const checkedCount = items.filter((i) => checks[i]).length;

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
              {planned ? (
                <p className="study-planned" role="note">
                  {planned.length === 0
                    ? '로드맵의 특정 일차에 배정된 문서는 아니에요. 복습용으로 활용하세요.'
                    : plannedDone
                      ? `로드맵에서 완료한 문서입니다 (${planned.map((d) => d.label).join(' · ')}).`
                      : `로드맵 ${planned.map((d) => `${d.label} ${formatPlannedDate(d.date)}`).join(' · ')} 에서 다룹니다 (시험일 ${roadmap.examDate?.replace(/-/g, '.')} 기준).`}{' '}
                  <Link to="/roadmap">로드맵 보기</Link>
                </p>
              ) : null}
              {items.length > 0 ? (
                <p className="study-checklist-status" role="status">
                  학습 완료 체크리스트 <strong>{checkedCount}/{items.length}</strong> — 문서 맨 아래에서 체크하면 이 기기에 저장됩니다.
                  자기 점검용 기록이라 정답률·이해도로 세지 않고, 로드맵 일차 완료도 자동으로 바뀌지 않아요.
                  {planned && planned.length > 0 && checkedCount === items.length && !plannedDone
                    ? ' 체크리스트를 다 채웠어요 — 로드맵에서 해당 일차를 완료로 표시할 수 있습니다.'
                    : ''}
                </p>
              ) : null}
              {checkSaveFailed ? (
                <p role="alert" className="study-checklist-status">브라우저 저장소에 기록하지 못했습니다. 새로고침하면 체크가 사라질 수 있어요.</p>
              ) : null}
              <MarkdownViewer content={content} checklist={checklist} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
