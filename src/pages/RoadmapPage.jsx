import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import LessonCard from '../components/ui/LessonCard';
import { BOOKMARK_TYPE } from '../domain/bookmarks';
import { LESSONS, lessonByDay } from '../domain/lessons';
import { DAILY_BLOCKS, DAILY_MINUTES, buildRoadmap, dayBlocks, topicLinks } from '../domain/roadmap';
import useStudyState from '../hooks/useStudyState';
import { loadStoredBusy } from '../utils/busyStore';
import { getExamDate, toLocalDateKey } from '../utils/storage';

const SCOPE_LABEL = { common: '공통', engineer: '기사 특화' };

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' → 'M/D(요일)' — UTC 로 해석해 로컬 시간대에 흔들리지 않는다 */
function formatDate(dateKey) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY[d.getUTCDay()]})`;
}

export default function RoadmapPage() {
  const [today] = useState(() => toLocalDateKey());
  const study = useStudyState();
  const [onlyBookmarks, setOnlyBookmarks] = useState(false);
  const [busy] = useState(loadStoredBusy);
  const todayRef = useRef(null);

  const roadmap = buildRoadmap({ examDate: getExamDate(), today, checks: study.checks, busyDates: busy.busyDates });
  const { progress } = roadmap;
  const shelf = onlyBookmarks ? LESSONS.filter((l) => study.isBookmarked(BOOKMARK_TYPE.LESSON, l.id)) : LESSONS;

  // 오늘 카드가 목록 아래쪽이면 화면 밖이다. 첫 렌더 뒤 한 번만 끌어온다.
  useEffect(() => {
    const el = todayRef.current;
    // 구현이 없는 환경(jsdom 등)에서는 건너뛴다
    if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
  }, []);

  const renderDay = (day) => (
    <li
      key={day.d}
      ref={day.isToday ? todayRef : null}
      className={`road-day${day.done ? ' is-done' : ''}${day.isToday ? ' is-today' : ''}${day.isPast && !day.done ? ' is-late' : ''}`}
    >
      <div className="road-day-head">
        <span className="road-day-d">{day.label}</span>
        <span className="road-day-date">{formatDate(day.date)}</span>
        {day.isToday ? <span className="badge badge-primary">오늘</span> : null}
        {day.busy ? <span className="badge badge-warning" title="캘린더에서 가져온 일정이 많은 날 — 가볍게 복습하세요">일정 많음</span> : null}
        {day.kind === 'practice' ? <span className="badge badge-danger">기출 실전</span> : null}
        <strong className="road-day-title">{day.title}</strong>
        {lessonByDay(day.d) ? (
          <Link className="note-link" to={`/lesson/${day.d}`}>
            레슨 <Icon name="chevron-right" size={14} />
          </Link>
        ) : null}
        {day.d > 0 ? (
          <label className="road-check">
            <input
              type="checkbox"
              checked={day.done}
              onChange={() => study.toggleDone(day.d)}
              aria-label={`${day.label} 학습 완료`}
            />
            <span>완료</span>
          </label>
        ) : null}
      </div>
      {day.kind === 'practice' ? (
        <p className="road-blocks road-blocks-practice">
          {dayBlocks(day).map((b) => (
            <span key={b.key} className="road-block">
              <strong>{b.label} {b.minutes}분</strong> {b.text}
            </span>
          ))}
        </p>
      ) : null}
      {day.gate ? (
        <p className="road-gate" role="note">
          <strong>기준 · {day.gate.metric}</strong>
          <span>{day.gate.pass}</span>
          <span>{day.gate.below}</span>
        </p>
      ) : null}
      <ul className="road-topics">
        {day.topics.map((topic) => (
          <li key={topic.text} className={`road-topic is-${topic.scope}`}>
            <span className={`badge ${topic.scope === 'engineer' ? 'badge-warning' : 'badge-success'}`}>
              {SCOPE_LABEL[topic.scope]}
            </span>
            <span className="road-topic-text">{topic.text}</span>
            <span className="road-topic-links">
              {topicLinks(topic).map((link) => (
                <Link key={link.to} className="note-link" to={link.to}>
                  {link.label} <Icon name="chevron-right" size={14} />
                </Link>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );

  return (
    <div className="page">
      <h1>25일 로드맵</h1>
      <p className="subtitle">
        시험일{roadmap.examDate ? ` ${roadmap.examDate.replace(/-/g, '.')}` : ''}까지 D-24 ~ D-Day, 4단계 학습 계획
      </p>

      <section className="card road-controls" aria-labelledby="road-target">
        <h2 id="road-target" className="road-controls-title">
          <Icon name="target" size={18} /> 정보처리기사 · 산업기사 공통 로드맵
        </h2>
        <p className="road-hint">
          두 시험을 함께 준비하는 하나의 계획입니다. 두 시험이 겹치는 <strong>공통 모듈</strong>(코딩 · SQL · OS/네트워크 · 테스트)을
          먼저 두고, <span className="badge badge-warning">기사 특화</span> 주제(SDLC · 디자인패턴 · 연계 · 보안)는 3단계에서
          공통 복습 뒤에 이어집니다.
        </p>

        <h3 className="road-blocks-title">하루 {DAILY_MINUTES}분 배분 — 매일 같다</h3>
        <ul className="road-blocks" aria-label="하루 학습 배분">
          {DAILY_BLOCKS.map((b) => (
            <li key={b.key} className={`road-block is-${b.key}`}>
              <strong>{b.label} {b.minutes}분</strong>
              <span>{b.text}</span>
              {b.to ? <Link className="note-link" to={b.to}>바로 가기 <Icon name="chevron-right" size={14} /></Link> : null}
            </li>
          ))}
        </ul>
        <p className="road-hint">
          코드 블록은 그날 주제가 OS·네트워크여도 빠지지 않습니다. 기출 실전일(<span className="badge badge-danger">기출 실전</span>)은
          세 블록 대신 복원 기출 1회분을 2시간 안에 풀고, 점검일의 <strong>기준</strong>이 다음 구간의 배분을 정합니다.
        </p>

        <div className="road-gauge">
          <div
            className="progress-bar"
            role="progressbar"
            aria-label="로드맵 진도"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <div className="fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="road-gauge-label">
            <strong>{progress.percent}%</strong> · {progress.done}/{progress.total}일 완료
          </p>
        </div>
      </section>

      <section className="tw:mb-6 tw:flex tw:flex-col tw:gap-3" aria-labelledby="road-lessons">
        <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
          <h2 id="road-lessons" className="tw:text-lg tw:font-bold tw:text-ink">
            일차별 레슨 <span className="tw:text-sm tw:font-normal tw:text-dim">({LESSONS.length}개 공개)</span>
          </h2>
          <label className="tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-2 tw:text-sm tw:text-ink">
            <input
              type="checkbox"
              checked={onlyBookmarks}
              onChange={(e) => setOnlyBookmarks(e.target.checked)}
              className="tw:size-4 tw:accent-primary"
            />
            북마크만 보기
          </label>
        </div>
        {shelf.length === 0 ? (
          <p className="tw:rounded-lg tw:border tw:border-dashed tw:border-line tw:p-4 tw:text-sm tw:text-dim">
            북마크한 레슨이 없습니다. 카드 오른쪽의 북마크 버튼으로 추가해 보세요.
          </p>
        ) : (
          <div className="tw:grid tw:gap-3 tw:md:grid-cols-2 tw:xl:grid-cols-3">
            {shelf.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                done={study.isDone(lesson.d)}
                bookmarked={study.isBookmarked(BOOKMARK_TYPE.LESSON, lesson.id)}
                onToggleBookmark={() => study.toggleBookmark(BOOKMARK_TYPE.LESSON, lesson.id)}
              />
            ))}
          </div>
        )}
      </section>

      {roadmap.isDefaultExamDate && roadmap.examDate ? (
        <p className="road-hint">
          시험일을 설정하지 않아 {roadmap.examDate.replace(/-/g, '.')} 기준으로 계산했습니다. 대시보드에서 바꿀 수 있어요.
        </p>
      ) : null}
      {roadmap.status === 'ok' && roadmap.late.length > 0 ? (
        <p className="road-hint road-late" role="status">
          밀린 일차 {roadmap.late.length}개: {roadmap.late.map((d) => `D-${d}`).join(' · ')}. 일차는 날짜에 고정돼 있어 자동으로
          옮겨지지 않아요 — 시간이 나는 날 이어서 하고 완료 표시를 해 주세요.
        </p>
      ) : null}
      {roadmap.status === 'before' ? (
        <p className="road-hint" role="status">로드맵은 D-24 부터 시작합니다. 아래는 시험일에 맞춘 전체 일정입니다.</p>
      ) : null}
      {roadmap.status === 'exam-passed' ? (
        <p className="road-hint" role="status">설정한 시험일이 지났습니다. 대시보드에서 다음 시험일을 선택해 주세요.</p>
      ) : null}

      {roadmap.phases.map((phase) => (
        <section key={phase.no} className="road-phase" aria-labelledby={`road-phase-${phase.no}`}>
          <h2 id={`road-phase-${phase.no}`} className="road-phase-title">
            <span className="road-phase-no">{phase.no}단계</span> {phase.name}
            <span className="road-phase-range">
              D-{phase.fromD} ~ D-{phase.toD}
            </span>
          </h2>
          <p className="road-phase-focus">{phase.focus}</p>
          <ol className="road-days">{phase.days.map(renderDay)}</ol>
        </section>
      ))}

      {roadmap.examDay ? (
        <section className="road-phase" aria-labelledby="road-exam-day">
          <h2 id="road-exam-day" className="road-phase-title">
            <Icon name="trophy" size={18} /> 시험 당일
          </h2>
          <ol className="road-days">{renderDay(roadmap.examDay)}</ol>
        </section>
      ) : null}
    </div>
  );
}
