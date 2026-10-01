import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { EXAM_TYPES, buildRoadmap, normalizeExamType, topicLinks } from '../domain/roadmap';
import { getExamDate, loadProgress, saveProgress, toLocalDateKey } from '../utils/storage';

const CHECKS_KEY = 'roadmap_checks';
const EXAM_TYPE_KEY = 'exam_type';

const SCOPE_LABEL = { common: '공통', engineer: '기사 특화' };

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' → 'M/D(요일)' — UTC 로 해석해 로컬 시간대에 흔들리지 않는다 */
function formatDate(dateKey) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY[d.getUTCDay()]})`;
}

function loadChecks() {
  const stored = loadProgress(CHECKS_KEY, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

export default function RoadmapPage() {
  const [today] = useState(() => toLocalDateKey());
  const [examType, setExamType] = useState(() => normalizeExamType(loadProgress(EXAM_TYPE_KEY, null)));
  const [checks, setChecks] = useState(loadChecks);
  const todayRef = useRef(null);

  const roadmap = buildRoadmap({ examDate: getExamDate(), today, examType, checks });
  const { progress } = roadmap;
  const activeType = EXAM_TYPES.find((t) => t.key === roadmap.examType);

  // 오늘 카드가 목록 아래쪽이면 화면 밖이다. 첫 렌더 뒤 한 번만 끌어온다.
  useEffect(() => {
    const el = todayRef.current;
    // 구현이 없는 환경(jsdom 등)에서는 건너뛴다
    if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
  }, []);

  const chooseType = (key) => {
    setExamType(key);
    saveProgress(EXAM_TYPE_KEY, key);
  };

  const toggleDay = (d) => {
    const next = { ...checks, [d]: !checks[d] };
    setChecks(next);
    saveProgress(CHECKS_KEY, next);
  };

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
        <strong className="road-day-title">{day.title}</strong>
        {day.d > 0 ? (
          <label className="road-check">
            <input
              type="checkbox"
              checked={day.done}
              onChange={() => toggleDay(day.d)}
              aria-label={`${day.label} 학습 완료`}
            />
            <span>완료</span>
          </label>
        ) : null}
      </div>
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
          <Icon name="target" size={18} /> 목표 시험
        </h2>
        <div className="road-toggle" role="radiogroup" aria-label="목표 시험 선택">
          {EXAM_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={roadmap.examType === t.key}
              className={`btn-outline road-toggle-button${roadmap.examType === t.key ? ' active' : ''}`}
              onClick={() => chooseType(t.key)}
            >
              {t.label}
              {t.key === 'both' ? <span className="road-toggle-default"> (기본)</span> : null}
            </button>
          ))}
        </div>
        <p className="road-hint" role="status">{activeType.hint}</p>
        {roadmap.examType === 'industrial' ? (
          <p className="road-hint">
            산업기사 출제 범위는 이 앱이 확정하지 않습니다 — 기사 특화로 분류한 주제를 뺀 것이니 Q-Net 공지로 확인하세요.
          </p>
        ) : null}

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

      {roadmap.isDefaultExamDate && roadmap.examDate ? (
        <p className="road-hint">
          시험일을 설정하지 않아 {roadmap.examDate.replace(/-/g, '.')} 기준으로 계산했습니다. 대시보드에서 바꿀 수 있어요.
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
