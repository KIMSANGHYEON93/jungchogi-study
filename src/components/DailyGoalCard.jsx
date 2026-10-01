import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { buildDailyPlan, daysUntil } from '../domain/dailyPlan';
import { STUDY_DAYS } from '../domain/studyDays';
import { toLocalDateKey } from '../utils/storage';

const ICON_BY_DAY = new Map(STUDY_DAYS.map((d) => [d.day, d.icon]));

/** 단위가 없는 복습일에 이어갈 화면 */
const REVIEW_LINKS = [
  { to: '/wrong', label: '오답노트' },
  { to: '/flashcard', label: '플래시카드' },
  { to: '/quiz', label: '코드 퀴즈' },
];

const UPCOMING_COUNT = 6;

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
  if (entry.units.length === 0) return '복습일';
  return entry.units.map((u) => `Day${String(u.day).padStart(2, '0')} ${u.label}`).join(' · ');
}

/**
 * 대시보드 "오늘의 목표 단계" 카드.
 *
 * 시험일까지 남은 일수에 남은 학습 단위(Day)를 균등 분배해 오늘 할 몫을 보여준다.
 * AI·서버를 쓰지 않으므로 항상 즉시 뜨고, 완료 체크가 바뀌면 남은 분량이 재분배된다.
 * 완료 체크 상태는 대시보드가 소유한다 — 여기서는 props 로 받고 토글만 위임한다.
 *
 * @param {{examDate: string, dayChecks: Record<string, boolean>, onToggleDay: (day: number) => void}} props
 *   examDate 가 빈 문자열이면 기본 시험일(10/25)로 계산한다.
 */
export default function DailyGoalCard({ examDate, dayChecks, onToggleDay }) {
  // 날짜는 마운트 시점에 고정한다 — 자정을 넘겨 열어 둔 탭은 새로고침 때 갱신된다.
  const [today] = useState(() => toLocalDateKey());
  const plan = useMemo(
    () => buildDailyPlan({ examDate: examDate || null, today, dayChecks }),
    [examDate, today, dayChecks]
  );
  const { status, today: entry, progress, daysLeft, schedule } = plan;
  const percent = Math.round((progress.done / progress.total) * 100);

  const upcoming = schedule.slice(1, 1 + UPCOMING_COUNT);
  const paceDays = daysUntil(plan.examDate, today);

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
              <p className="goal-unit-phase">오늘은 복습일 — 새 Day 없이 약한 부분을 다집니다</p>
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
        </>
      ) : null}
    </section>
  );
}
