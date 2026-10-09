import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { addDays } from '../domain/dailyPlan';
import { summarizeBusyDays } from '../domain/calendarBusy';
import { lessonByDay } from '../domain/lessons';
import { ROADMAP_DAYS, buildRoadmap, dayBlocks, roadmapSchedule, topicLinks, upcomingDays } from '../domain/roadmap';
import { adjustmentFor, catchUpPlan, evaluateGate } from '../domain/planAdvice';
import { CatchUpPanel, GateBands, LoadNote } from './PlanAdvice';
import useStudyState from '../hooks/useStudyState';
import { fetchCalendarEvents, isGoogleCalendarConfigured, loadGisScript } from '../services/googleCalendar';
import { buildIcs, downloadIcs } from '../utils/icsExport';
import { clearBusy, loadStoredBusy, saveBusy } from '../utils/busyStore';
import { getExamSessions, loadProgress, toLocalDateKey } from '../utils/storage';

const GATE_DAYS = ROADMAP_DAYS.filter((x) => x.gate);

const SCOPE_LABEL = { common: '공통', engineer: '기사 특화' };
const UPCOMING_COUNT = 6;

/** 'YYYY-MM-DD' → 'M/D(요일)' — 날짜 문자열을 UTC 로 해석해 로컬 시간대에 흔들리지 않는다 */
function formatShortDate(dateKey) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${weekday})`;
}

/**
 * 대시보드 "오늘의 로드맵" 카드 — 25일 로드맵(domain/roadmap.js)에서 오늘 일차를 꺼내 보여 준다.
 *
 * 앱의 계획은 로드맵 하나다. 일차는 날짜에 고정돼 있어 매일 바뀌지 않고, 지났는데 못 끝낸 일차는 "밀린 일차"로 보인다.
 * 완료 체크는 로드맵·레슨 화면과 같은 저장소(`useStudyState`)를 쓰므로 어느 화면에서 눌러도 같이 바뀐다.
 *
 * @param {{examDate: string}} props examDate 가 빈 문자열이면 기본 시험일(10/25)로 계산한다.
 */
export default function TodayRoadmapCard({ examDate }) {
  // 날짜는 마운트 시점에 고정한다 — 자정을 넘겨 열어 둔 탭은 새로고침 때 갱신된다.
  const [today] = useState(() => toLocalDateKey());
  const [busy, setBusy] = useState(loadStoredBusy);
  // 'idle' | 'loading' | 'done' | 'error' — 가져오기 진행 상태
  const [sync, setSync] = useState({ status: 'idle', message: '' });
  const study = useStudyState();
  const [diag] = useState(() => ({
    sessions: getExamSessions(),
    traceProgress: loadProgress('practice_done', {})?.trace ?? {},
  }));

  const roadmap = useMemo(
    () => buildRoadmap({ examDate: examDate || null, today, checks: study.checks, busyDates: busy.busyDates }),
    [examDate, today, study.checks, busy.busyDates]
  );
  const calendarConfigured = isGoogleCalendarConfigured();
  const { status, today: day, progress, late } = roadmap;
  const upcoming = upcomingDays(roadmap, UPCOMING_COUNT);
  const lesson = day ? lessonByDay(day.d) : null;
  const catchUp = catchUpPlan(roadmap);
  const adjustment = day && day.d > 0 ? adjustmentFor(day, { ...diag, gateDays: GATE_DAYS }) : null;

  // 지금 시점의 남은 일정을 .ics 로 내려받는다. 날짜별 UID 가 고정이라 다시 가져와도
  // 새 이벤트가 쌓이지 않는다(완료 체크로 일정이 바뀐 뒤 다시 내보내면 갱신).
  const handleExport = () => downloadIcs(buildIcs(roadmapSchedule(roadmap)), `jungchogi-roadmap-${today}.ics`);

  // 오늘 ~ 시험 당일의 일정을 가져와 일정이 많은 날을 표시한다. 클릭에서 바로 호출해야 로그인 팝업이 막히지 않는다.
  const handleImport = async () => {
    if (!roadmap.examDate) return;
    setSync({ status: 'loading', message: '' });
    try {
      const timeMin = new Date(`${today}T00:00:00`).toISOString();
      const timeMax = new Date(`${addDays(roadmap.examDate, 1)}T00:00:00`).toISOString();
      const events = await fetchCalendarEvents({ timeMin, timeMax });
      const { busyDates } = summarizeBusyDays(events);
      setBusy(saveBusy(busyDates));
      setSync({
        status: 'done',
        message:
          busyDates.length > 0
            ? `일정이 많은 ${busyDates.length}일을 로드맵에 표시했습니다. 그날은 가볍게 복습하고 밀린 일차는 다른 날에 하세요.`
            : '일정이 많은 날이 없습니다.',
      });
    } catch (err) {
      // 서비스가 사용자에게 보일 한국어 메시지를 준다. 그 밖의 예외는 일반 문구로 둔다.
      setSync({ status: 'error', message: err?.message || '캘린더 일정을 가져오지 못했습니다.' });
    }
  };

  // 클릭 때 스크립트를 처음 받으면 로드를 기다리는 사이 브라우저가 클릭과 팝업의 연결을 끊어
  // 로그인 팝업을 막을 수 있다. 마우스를 올리거나 포커스하는 순간 미리 받아 둔다.
  // 매 방문마다 제3자 스크립트를 부르지 않도록 버튼과 상호작용할 때만 한다.
  const preloadGoogle = () => {
    if (calendarConfigured) loadGisScript().catch(() => {});
  };

  const handleClearImport = () => {
    clearBusy();
    setBusy({ busyDates: [], syncedAt: null });
    setSync({ status: 'idle', message: '' });
  };

  return (
    <section className="card goal-card" aria-labelledby="daily-goal-title">
      <div className="goal-head">
        <h2 className="goal-title" id="daily-goal-title">
          <Icon name="calendar" size={18} /> 오늘의 로드맵
        </h2>
        {day ? <span className="badge badge-primary goal-dday">{day.label}</span> : null}
        <span className="goal-date">{today.replace(/-/g, '.')}</span>
      </div>

      {roadmap.isDefaultExamDate && roadmap.examDate ? (
        <p className="goal-hint">
          시험일을 설정하지 않아 {roadmap.examDate.replace(/-/g, '.')} 기준으로 계산했습니다.
          위 D-Day 카드에서 바꿀 수 있어요.
        </p>
      ) : null}

      {status === 'exam-passed' ? (
        <p className="goal-hint" role="status">
          설정한 시험일이 지났습니다. D-Day 카드에서 다음 시험일을 선택해 주세요.
        </p>
      ) : null}

      {status === 'no-date' ? (
        <p className="goal-hint" role="status">시험일을 확인할 수 없습니다.</p>
      ) : null}

      {status === 'before' ? (
        <p className="goal-hint" role="status">
          로드맵은 D-{roadmap.phases[0]?.fromD} ({formatShortDate(roadmap.phases[0].days[0].date)}) 부터 시작합니다.
          시작 전까지 오답노트와 카드로 가볍게 워밍업하세요.
        </p>
      ) : null}

      {status === 'ok' && day ? (
        <div className={`goal-unit goal-roadmap-day${day.done ? ' is-done' : ''}`}>
          <div className="goal-unit-body">
            <span className="goal-unit-phase">
              {day.d === 0 ? '시험 당일' : `${day.phaseNo}단계`} · {formatShortDate(day.date)}
              {day.busy ? ' · 일정이 많은 날 — 가볍게' : ''}
            </span>
            <strong className="goal-unit-title">{day.title}</strong>
            {dayBlocks(day).length > 0 ? (
              <ul className="goal-blocks" aria-label="오늘 학습 배분">
                {dayBlocks(day).map((b) => (
                  <li key={b.key} className={`goal-block is-${b.key}`}>
                    <strong>{b.label} {b.minutes}분</strong>
                    {b.to ? <Link className="note-link" to={b.to}>{b.text}</Link> : <span>{b.text}</span>}
                  </li>
                ))}
              </ul>
            ) : null}
            <LoadNote day={day} />
            {adjustment ? <p className="road-adjust" role="note">배분 조정 · {adjustment.text}</p> : null}
            {day.gate ? <GateBands gate={day.gate} evaluation={evaluateGate(day, diag)} /> : null}
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
            {lesson ? (
              <Link className="btn-primary goal-lesson-link" to={`/lesson/${lesson.d}`}>
                오늘의 레슨 · {lesson.title}
              </Link>
            ) : null}
          </div>
          {day.d > 0 ? (
            <button
              type="button"
              className={day.done ? 'btn-outline goal-check' : 'btn-primary goal-check'}
              aria-pressed={day.done}
              aria-label={`${day.label} 학습 완료`}
              onClick={() => study.toggleDone(day.d)}
            >
              <Icon name="check" size={14} /> {day.done ? '완료 취소' : '완료'}
            </button>
          ) : null}
        </div>
      ) : null}

      {status === 'ok' && late.length > 0 && catchUp ? <CatchUpPanel plan={catchUp} compact /> : null}

      {status === 'ok' || status === 'before' ? (
        <>
          <div className="progress-bar" role="progressbar" aria-label="로드맵 진도"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
            <div className="fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="goal-meta">
            {progress.done}/{progress.total}일 완료 · <Link to="/roadmap">25일 로드맵 전체 보기</Link>
          </p>

          {upcoming.length > 0 ? (
            <details className="goal-upcoming">
              <summary>다가오는 일정 {upcoming.length}일</summary>
              <ol className="goal-upcoming-list">
                {upcoming.map((e) => (
                  <li key={e.d} className="goal-upcoming-item">
                    <span className="goal-upcoming-date">{formatShortDate(e.date)}</span>
                    <span className="goal-upcoming-dday">{e.label}</span>
                    <span className="goal-upcoming-summary">
                      {e.title}
                      {e.busy ? ' · 일정이 많은 날' : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}

          <button type="button" className="btn-outline goal-export" onClick={handleExport}>
            <Icon name="calendar" size={14} /> 캘린더로 내보내기 (.ics)
          </button>
          <p className="goal-hint goal-export-hint">
            Google 캘린더 · 애플 캘린더 · 아웃룩의 &quot;가져오기&quot;로 열 수 있습니다. 새 캘린더(예:
            정처기)를 만들어 가져오면 시험일이 바뀌었을 때 캘린더째 지우고 다시 가져올 수 있어요.
          </p>

          {/* 클라이언트 ID 가 없는 배포에서는 쓸 수 없는 기능이라 아예 숨긴다 — 설정 방법은 README 에 있다.
              예전에는 꺼진 버튼과 함께 'VITE_GOOGLE_CLIENT_ID' 같은 개발자용 문구가 사용자에게 보였다 */}
          {calendarConfigured ? (
          <div className="goal-import">
            <button
              type="button"
              className="btn-outline goal-import-button"
              onClick={handleImport}
              onPointerEnter={preloadGoogle}
              onFocus={preloadGoogle}
              disabled={sync.status === 'loading'}
            >
              <Icon name="repeat" size={14} />{' '}
              {sync.status === 'loading' ? '가져오는 중…' : 'Google 캘린더에서 일정 가져오기'}
            </button>
            {busy.busyDates.length > 0 ? (
              <button type="button" className="btn-outline goal-import-button" onClick={handleClearImport}>
                가져온 일정 해제
              </button>
            ) : null}
            <p className="goal-hint goal-import-hint" role="status">
              {sync.message ||
                (busy.busyDates.length > 0
                  ? `가져온 일정 기준으로 일정이 많은 ${busy.busyDates.length}일을 로드맵에 표시했습니다.`
                  : '로그인하면 일정이 많은 날(하루 6시간 이상)을 로드맵에 표시합니다. 일정 제목·내용은 읽지 않고 시간만 사용합니다.')}
            </p>
          </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
