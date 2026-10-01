import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { addDays, buildDailyPlan, daysUntil } from '../domain/dailyPlan';
import { summarizeBusyDays } from '../domain/calendarBusy';
import { STUDY_DAYS } from '../domain/studyDays';
import { fetchCalendarEvents, isGoogleCalendarConfigured, loadGisScript } from '../services/googleCalendar';
import { buildIcs, downloadIcs } from '../utils/icsExport';
import { clearProgress, loadProgress, saveProgress, toLocalDateKey } from '../utils/storage';

const ICON_BY_DAY = new Map(STUDY_DAYS.map((d) => [d.day, d.icon]));

/** 단위가 없는 복습일에 이어갈 화면 */
const REVIEW_LINKS = [
  { to: '/wrong', label: '오답노트' },
  { to: '/flashcard', label: '플래시카드' },
  { to: '/quiz', label: '코드 퀴즈' },
];

const UPCOMING_COUNT = 6;

/** 가져온 "바쁜 날" 저장 키 — 날짜 목록과 시각만 둔다. 일정 제목·내용은 받지도 저장하지도 않는다 */
const CALENDAR_BUSY_KEY = 'calendar_busy';

function loadStoredBusy() {
  const stored = loadProgress(CALENDAR_BUSY_KEY, null);
  const dates = Array.isArray(stored?.busyDates) ? stored.busyDates.filter((d) => typeof d === 'string') : [];
  return { busyDates: dates, syncedAt: typeof stored?.syncedAt === 'number' ? stored.syncedAt : null };
}

function formatDDay(dDay) {
  return dDay === 0 ? 'D-Day' : `D-${dDay}`;
}

/** 'YYYY-MM-DD' → 'M/D(요일)' — 날짜 문자열을 UTC 로 해석해 로컬 시간대에 흔들리지 않는다 */
function formatShortDate(dateKey) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${weekday})`;
}

function entrySummary(entry) {
  if (entry.kind === 'exam') return '시험 당일';
  if (entry.units.length === 0) return entry.busy ? '일정이 많은 날 · 복습만' : '복습일';
  return entry.units.map((u) => `Day${String(u.day).padStart(2, '0')} ${u.label}`).join(' · ');
}

/**
 * 대시보드 "오늘의 목표 단계" 카드.
 *
 * 시험일까지 남은 일수에 남은 학습 단위(Day)를 균등 분배해 오늘 할 몫을 보여준다.
 * 서버를 쓰지 않으므로 항상 즉시 뜨고, 완료 체크가 바뀌면 남은 분량이 재분배된다.
 * 완료 체크 상태는 대시보드가 소유한다 — 여기서는 props 로 받고 토글만 위임한다.
 *
 * @param {{examDate: string, dayChecks: Record<string, boolean>, onToggleDay: (day: number) => void}} props
 *   examDate 가 빈 문자열이면 기본 시험일(10/25)로 계산한다.
 */
export default function DailyGoalCard({ examDate, dayChecks, onToggleDay }) {
  // 날짜는 마운트 시점에 고정한다 — 자정을 넘겨 열어 둔 탭은 새로고침 때 갱신된다.
  const [today] = useState(() => toLocalDateKey());
  const [busy, setBusy] = useState(loadStoredBusy);
  // 'idle' | 'loading' | 'done' | 'error' — 가져오기 진행 상태
  const [sync, setSync] = useState({ status: 'idle', message: '' });
  const plan = useMemo(
    () => buildDailyPlan({ examDate: examDate || null, today, dayChecks, busyDates: busy.busyDates }),
    [examDate, today, dayChecks, busy.busyDates]
  );
  const calendarConfigured = isGoogleCalendarConfigured();
  const { status, today: entry, progress, daysLeft, schedule } = plan;
  const percent = Math.round((progress.done / progress.total) * 100);

  const upcoming = schedule.slice(1, 1 + UPCOMING_COUNT);
  const paceDays = daysUntil(plan.examDate, today);

  // 지금 시점의 남은 일정을 .ics 로 내려받는다. 날짜별 UID 가 고정이라 다시 가져와도
  // 새 이벤트가 쌓이지 않는다(완료 체크로 일정이 바뀐 뒤 다시 내보내면 갱신).
  const handleExport = () => downloadIcs(buildIcs(schedule), `jungchogi-plan-${today}.ics`);

  // 오늘 ~ 시험 당일의 일정을 가져와 바쁜 날을 표시한다. 클릭에서 바로 호출해야 로그인 팝업이 막히지 않는다.
  const handleImport = async () => {
    if (!plan.examDate) return;
    setSync({ status: 'loading', message: '' });
    try {
      const timeMin = new Date(`${today}T00:00:00`).toISOString();
      const timeMax = new Date(`${addDays(plan.examDate, 1)}T00:00:00`).toISOString();
      const events = await fetchCalendarEvents({ timeMin, timeMax });
      const { busyDates } = summarizeBusyDays(events);
      const next = { busyDates, syncedAt: Date.now() };
      setBusy(next);
      saveProgress(CALENDAR_BUSY_KEY, next);
      setSync({
        status: 'done',
        message:
          busyDates.length > 0
            ? `일정이 많은 ${busyDates.length}일을 피해 분량을 다시 나눴습니다.`
            : '일정이 많은 날이 없어 분량은 그대로입니다.',
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
    clearProgress(CALENDAR_BUSY_KEY);
    setBusy({ busyDates: [], syncedAt: null });
    setSync({ status: 'idle', message: '' });
  };

  return (
    <section className="card goal-card" aria-labelledby="daily-goal-title">
      <div className="goal-head">
        <h2 className="goal-title" id="daily-goal-title">
          <Icon name="calendar" size={18} /> 오늘의 목표 단계
        </h2>
        {status === 'ok' || status === 'all-done' ? (
          <span className="badge badge-primary goal-dday">{formatDDay(daysLeft)}</span>
        ) : null}
        <span className="goal-date">{today.replace(/-/g, '.')}</span>
      </div>

      {plan.isDefaultExamDate && plan.examDate ? (
        <p className="goal-hint">
          시험일을 설정하지 않아 {plan.examDate.replace(/-/g, '.')} 기준으로 계산했습니다.
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

      {status === 'all-done' ? (
        <p className="goal-done" role="status">
          <Icon name="party" size={16} /> 14일 학습을 모두 마쳤습니다. 오답노트와 모의고사로 마무리하세요.
        </p>
      ) : null}

      {status === 'ok' && entry ? (
        <>
          {entry.units.length > 0 ? (
            <ul className="goal-units">
              {entry.units.map((unit) => {
                const checked = !!dayChecks?.[unit.day];
                return (
                  <li key={unit.day} className={`goal-unit${checked ? ' is-done' : ''}`}>
                    <Icon name={ICON_BY_DAY.get(unit.day) ?? 'book-open'} size={20} />
                    <div className="goal-unit-body">
                      <span className="goal-unit-phase">{unit.phase.label}</span>
                      <Link className="goal-unit-title" to={`/study?day=${unit.day}`}>
                        Day{String(unit.day).padStart(2, '0')} · {unit.label}
                      </Link>
                    </div>
                    <button
                      type="button"
                      className={checked ? 'btn-outline goal-check' : 'btn-primary goal-check'}
                      aria-pressed={checked}
                      onClick={() => onToggleDay(unit.day)}
                    >
                      <Icon name="check" size={14} /> {checked ? '완료 취소' : '완료'}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="goal-review">
              <p className="goal-unit-phase">
                {entry.busy
                  ? '오늘은 캘린더에 일정이 많아 새 Day 를 배정하지 않았습니다 — 가볍게 복습만 하세요'
                  : '오늘은 복습일 — 새 Day 없이 약한 부분을 다집니다'}
              </p>
              <div className="goal-review-links">
                {REVIEW_LINKS.map((link) => (
                  <Link key={link.to} className="btn-outline goal-review-link" to={link.to}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="progress-bar" role="progressbar" aria-label="14일 학습 진도"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="goal-meta">
            {progress.done}/{progress.total} Day 완료 · 남은 {progress.remaining}개
            {paceDays > 1 && progress.perDay > 0
              ? ` · 시험 전날까지 하루 평균 ${progress.perDay}개`
              : ''}
          </p>

          {upcoming.length > 0 ? (
            <details className="goal-upcoming">
              <summary>다가오는 일정 {upcoming.length}일</summary>
              <ol className="goal-upcoming-list">
                {upcoming.map((e) => (
                  <li key={e.date} className="goal-upcoming-item">
                    <span className="goal-upcoming-date">{formatShortDate(e.date)}</span>
                    <span className="goal-upcoming-dday">{formatDDay(e.dDay)}</span>
                    <span className="goal-upcoming-summary">{entrySummary(e)}</span>
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

          <div className="goal-import">
            <button
              type="button"
              className="btn-outline goal-import-button"
              onClick={handleImport}
              onPointerEnter={preloadGoogle}
              onFocus={preloadGoogle}
              disabled={!calendarConfigured || sync.status === 'loading'}
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
              {!calendarConfigured
                ? 'Google 캘린더 연동은 아직 설정되지 않았습니다 (VITE_GOOGLE_CLIENT_ID — README 참고).'
                : sync.message ||
                  (busy.busyDates.length > 0
                    ? `가져온 일정 기준으로 일정이 많은 ${busy.busyDates.length}일을 피해 배정했습니다.`
                    : '로그인하면 일정이 많은 날(하루 6시간 이상)을 피해 분량을 나눕니다. 일정 제목·내용은 읽지 않고 시간만 사용합니다.')}
            </p>
          </div>
        </>
      ) : null}
    </section>
  );
}
