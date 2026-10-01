import { useMemo, useState } from 'react';
import { gradeAnswer } from '../domain/shortAnswer';

const EMPTY = { answer: '', graded: null, showModel: false };

/**
 * 단답·약술 키워드 채점기.
 *
 * 채점 전에는 키워드와 모범 답안을 숨긴다 — 보이는 순간 "쓰는" 연습이 "고르는" 연습이 된다.
 * 채점은 키워드 포함 여부만 보며(서버·AI 없음), 사용자가 쓴 원문에서 매칭 구간을 하이라이트한다.
 *
 * @param {{item: {id: string, topic: string, question: string, keywords: {label: string, aliases?: string[]}[], model: string}}} props
 *   문항이 바뀌면(item.id) 입력·결과가 자동으로 초기화된다.
 */
export default function ShortAnswerGrader({ item }) {
  // 문항 id 를 함께 저장해 두고, 다른 문항이 들어오면 초기 상태로 본다 (effect 로 되돌리지 않는다)
  const [state, setState] = useState({ id: item.id, ...EMPTY });
  const { answer, graded, showModel } = state.id === item.id ? state : EMPTY;
  const update = (patch) => setState({ id: item.id, answer, graded, showModel, ...patch });

  const result = useMemo(
    () => (graded === null ? null : gradeAnswer(graded, item.keywords)),
    [graded, item.keywords]
  );
  const inputId = `sag-input-${item.id}`;

  return (
    <section className="card sag" aria-labelledby={`sag-q-${item.id}`}>
      <span className="sag-topic">{item.topic}</span>
      <h3 className="sag-question" id={`sag-q-${item.id}`}>{item.question}</h3>

      {result === null ? (
        <>
          <label className="sag-label" htmlFor={inputId}>내 답안</label>
          <textarea
            id={inputId}
            className="quiz-input sag-textarea"
            rows={4}
            value={answer}
            placeholder="핵심 키워드를 넣어 서술해 보세요"
            onChange={(e) => update({ answer: e.target.value })}
          />
          <div className="sag-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={answer.trim() === ''}
              onClick={() => update({ graded: answer })}
            >
              채점
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="sag-label">내 답안</p>
          <p className="sag-answer">
            {result.segments.map((seg, i) =>
              seg.hit ? (
                <mark key={i} className="sag-hit">{seg.text}</mark>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
          </p>

          <p className="sag-score" role="status">
            {result.matched.length}/{item.keywords.length} 키워드 포함
          </p>
          <ul className="sag-keywords">
            {result.matched.map((k) => (
              <li key={k.label} className="sag-kw sag-kw-hit">
                <span aria-hidden="true">✓</span>
                <span className="sag-sr">포함: </span>
                {k.label}
              </li>
            ))}
            {result.missed.map((k) => (
              <li key={k.label} className="sag-kw sag-kw-miss">
                <span aria-hidden="true">✗</span>
                <span className="sag-sr">누락: </span>
                {k.label}
              </li>
            ))}
          </ul>

          <div className="sag-actions">
            <button
              type="button"
              className="btn-outline"
              aria-expanded={showModel}
              onClick={() => update({ showModel: !showModel })}
            >
              {showModel ? '모범 답안 숨기기' : '모범 답안 보기'}
            </button>
            <button type="button" className="btn-outline" onClick={() => setState({ id: item.id, ...EMPTY })}>
              다시 쓰기
            </button>
          </div>
          {showModel ? <p className="sag-model">{item.model}</p> : null}
        </>
      )}
    </section>
  );
}
