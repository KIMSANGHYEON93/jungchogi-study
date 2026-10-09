import { Link } from 'react-router-dom';
import { dayLoad } from '../domain/roadmap';
import { formatMinutes } from '../domain/studyTime';

/**
 * 점검일의 점수 구간표. 측정값이 있으면 들어간 구간을 강조한다. 구간은 0~100 을 빈틈없이 덮는다.
 * @param {{gate: {metric: string, unit: string, bands: {min: number, label: string, action: string}[]}, evaluation?: {measured: number|null, band: object|null, note: string}|null}} props
 */
export function GateBands({ gate, evaluation }) {
  return (
    <div className="road-gate" role="note">
      <strong>기준 · {gate.metric}</strong>
      <ul className="road-gate-bands">
        {gate.bands.map((b) => {
          const hit = evaluation?.band === b;
          return (
            <li key={b.label} className={hit ? 'is-hit' : undefined} aria-current={hit ? 'true' : undefined}>
              <span className="road-gate-range">{b.label}</span> → {b.action}
              {hit ? <span className="badge badge-primary">현재 {evaluation.measured}{gate.unit}</span> : null}
            </li>
          );
        })}
      </ul>
      {evaluation?.note ? <span className="road-gate-note">{evaluation.note}</span> : null}
    </div>
  );
}

/** 그날 계획량이 하루 가용 시간을 넘으면 넘는 만큼과 넘길 방법을 보여 준다 */
export function LoadNote({ day }) {
  const load = dayLoad(day);
  if (load.overflow <= 0) return null;
  return (
    <p className="road-load" role="note">
      계획 {formatMinutes(load.planned)} · 하루 가용 {formatMinutes(load.available)} → <strong>{load.overflow}분 초과</strong>.
      실전 모의고사는 끊지 않고 한 번에 풀어야 하므로 이날 시간을 더 내거나,
      {load.carryMinutes > 0 ? ` 채점 · 오답 정리 ${load.carryMinutes}분은 다음 날 복습 블록으로 넘기세요.` : ' 다른 날로 옮기세요.'}
      {load.overflow > load.carryMinutes ? ` 그래도 ${load.overflow - load.carryMinutes}분이 남으니 시간을 낼 수 있는 날(주말 등)로 바꾸는 것을 권합니다.` : ''}
    </p>
  );
}

/** 밀린 일정 보충 계획 */
export function CatchUpPanel({ plan, compact = false }) {
  if (!plan) return null;
  const { lateStudy, latePractice, assignments, optional, feasible, perDay, slotCount, extraPerDayNeeded } = plan;
  return (
    <div className="road-catchup" role="status">
      <strong>
        밀린 일차 {lateStudy.length + latePractice.length}개
        {lateStudy.length > 0 ? ` — 학습일 ${lateStudy.map((d) => `D-${d}`).join(' · ')}` : ''}
        {latePractice.length > 0 ? ` · 실전일 ${latePractice.map((d) => `D-${d}`).join(' · ')}` : ''}
      </strong>
      {compact ? (
        <span>
          {feasible ? ' 남은 학습일에 하루 20분씩 나눠 보충할 수 있어요.' : ' 남은 기간 안에 다 보충할 수 없어 필수·선택을 나눴어요.'}{' '}
          <Link to="/roadmap">보충 계획 보기</Link>
        </span>
      ) : (
        <>
          <p>
            밀린 학습일의 <strong>필수 몫은 주제 블록(레슨 확인 퀴즈 + 학습 목표) 40분</strong>입니다. 코드·복습 블록은 매일 돌기 때문에 따로 보충하지 않습니다.
            보충은 남은 보통 학습일 {slotCount}일의 코드 블록에서 하루 {perDay}분을 빌려 하루 120분을 넘기지 않게 짰습니다.
            원래 일차의 날짜와 완료 기록은 그대로이고, 아래는 <em>재배치 제안</em>입니다.
          </p>
          {assignments.length > 0 ? (
            <ul>
              {assignments.map((a) => (
                <li key={a.d}>
                  원래 {a.label} {a.title} → {a.parts.map((p) => `${p.label}(${p.date.slice(5).replace('-', '/')}) ${p.minutes}분`).join(' + ')}
                </li>
              ))}
            </ul>
          ) : null}
          {optional.length > 0 ? (
            <p>
              남은 기간에 다 넣을 수 없어 <strong>선택 학습</strong>으로 돌렸습니다: {optional.map((x) => `${x.label} ${x.title}`).join(' · ')} —
              레슨 확인 퀴즈만 풀고(약 15분) 틀린 문항은 오답노트로 넘기세요.
              {extraPerDayNeeded ? ` 전부 하려면 남은 학습일마다 약 ${extraPerDayNeeded}분을 더 내야 합니다.` : ''}
            </p>
          ) : null}
          {latePractice.length > 0 ? (
            <p>지난 실전 모의고사일은 다시 하지 않고 다음 실전일에 맡깁니다(같은 주에 시험을 몰아 풀면 채점·복습이 밀립니다).</p>
          ) : null}
        </>
      )}
    </div>
  );
}
