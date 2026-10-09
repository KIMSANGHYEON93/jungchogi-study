import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { EXAM_AREAS, EXAM_OVERVIEW, WEIGHT_LABEL, WEIGHT_NOTES } from '../domain/examAreas';

const WEIGHT_BADGE = { core: 'badge-danger', calc: 'badge-warning' };

export default function GuidePage() {
  return (
    <div className="page">
      <h1>영역 안내</h1>
      <p className="subtitle">정보처리기사 실기 — 시험 개요와 출제기준 12개 영역</p>

      <section className="card guide-section" aria-labelledby="guide-overview">
        <h2 id="guide-overview" className="guide-title">
          <Icon name="file-text" size={18} /> 1. 실기시험 기본 개요
        </h2>
        <dl className="guide-overview">
          {EXAM_OVERVIEW.map((row) => (
            <div key={row.label} className="guide-overview-row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card guide-section" aria-labelledby="guide-areas">
        <h2 id="guide-areas" className="guide-title">
          <Icon name="layers" size={18} /> 2. 실기 출제기준 주요 항목 (총 {EXAM_AREAS.length}개)
        </h2>
        <ol className="guide-areas">
          {EXAM_AREAS.map((area) => (
            <li key={area.no} className={`guide-area${area.weight ? ` is-${area.weight}` : ''}`}>
              <span className="guide-area-no">{String(area.no).padStart(2, '0')}</span>
              <div className="guide-area-body">
                <div className="guide-area-head">
                  <strong>{area.name}</strong>
                  {area.weight ? (
                    <span className={`badge ${WEIGHT_BADGE[area.weight]}`}>{WEIGHT_LABEL[area.weight]}</span>
                  ) : null}
                </div>
                <p className="guide-area-detail">{area.detail}</p>
                <Link className="note-link" to={`/search?q=${encodeURIComponent(area.query)}`}>
                  자료에서 찾기 · {area.query} <Icon name="chevron-right" size={14} />
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card guide-section" aria-labelledby="guide-weight">
        <h2 id="guide-weight" className="guide-title">
          <Icon name="target" size={18} /> 3. 학습 우선순위 (앱의 판단 — 공식 출제 비중 아님)
        </h2>
        <ul className="guide-weights">
          {WEIGHT_NOTES.map((note) => (
            <li key={note.key} className={`guide-weight is-${note.key}`}>
              <strong>{note.title}</strong>
              <p>{note.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
