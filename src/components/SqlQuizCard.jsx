import { useState } from 'react';
import { checkBlank } from '../domain/sqlBlanks';

/** 템플릿을 `[[n]]` 자리에서 쪼갠다 → 글자 조각과 빈칸 번호가 번갈아 나오는 배열 */
function splitTemplate(template) {
  const parts = [];
  const re = /\[\[(\d+)\]\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) parts.push({ text: template.slice(last, m.index) });
    parts.push({ blank: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < template.length) parts.push({ text: template.slice(last) });
  return parts;
}

/**
 * SQL 빈칸 채우기 카드 — 코드 모양 안에 입력칸을 끼워 넣고 칸별로 채점한다.
 * 상태는 카드 안에만 둔다. 문항을 바꿀 때는 부모가 `key={item.id}` 를 주면 초기화된다.
 *
 * @param {{item: {
 *   id: string, title: string, prompt: string,
 *   tables: {name: string, columns: string[]}[],
 *   template: string,
 *   blanks: {id: number, answers: string[]}[],
 *   solution: string
 * }}} props
 */
export default function SqlQuizCard({ item, onComplete }) {
  const [values, setValues] = useState({});
  const [graded, setGraded] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  const parts = splitTemplate(item.template);
  const answersOf = (id) => item.blanks.find((b) => b.id === id)?.answers ?? [];
  const isRight = (id) => checkBlank(values[id] ?? '', answersOf(id));
  const rightCount = item.blanks.filter((b) => isRight(b.id)).length;

  function onChange(id, value) {
    setValues((prev) => ({ ...prev, [id]: value }));
    // 고치면 이전 채점 표시는 낡은 정보라 지운다
    setGraded(false);
  }

  function reset() {
    setValues({});
    setGraded(false);
    setShowSolution(false);
  }

  return (
    <div className="sqlq card">
      <h3 className="sqlq-title">{item.title}</h3>
      <p className="sqlq-prompt">{item.prompt}</p>

      <ul className="sqlq-tables" aria-label="테이블 스키마">
        {item.tables.map((t) => (
          <li key={t.name}>
            <strong>{t.name}</strong>
            <span className="sqlq-columns">({t.columns.join(', ')})</span>
          </li>
        ))}
      </ul>

      <pre className="sqlq-code">
        {parts.map((p, idx) => {
          if (p.text !== undefined) return <span key={idx}>{p.text}</span>;
          const state = graded ? (isRight(p.blank) ? ' sqlq-input--ok' : ' sqlq-input--bad') : '';
          const width = Math.max(6, ...answersOf(p.blank).map((a) => a.length)) + 2;
          return (
            <input
              key={idx}
              className={`quiz-input sqlq-input${state}`}
              type="text"
              value={values[p.blank] ?? ''}
              aria-label={`빈칸 ${p.blank}`}
              aria-invalid={graded && !isRight(p.blank) ? 'true' : undefined}
              style={{ width: `${width}ch` }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => onChange(p.blank, e.target.value)}
            />
          );
        })}
      </pre>

      <div className="sqlq-actions">
        <button type="button" className="btn-primary" onClick={() => {
            setGraded(true);
            // 빈칸을 모두 맞히면 완료, 하나라도 틀리면 오답으로 남긴다
            onComplete?.(rightCount === item.blanks.length ? 'done' : 'wrong');
          }}>
          채점
        </button>
        <button type="button" className="btn-outline" onClick={() => setShowSolution(true)}>
          정답 보기
        </button>
        <button type="button" className="btn-outline" onClick={reset}>
          다시 풀기
        </button>
      </div>

      <p className="sqlq-status" role="status">
        {graded ? `${rightCount}/${item.blanks.length} 정답` : ''}
      </p>

      {showSolution && (
        <pre className="sqlq-solution" aria-label="정답 SQL">
          {item.solution}
        </pre>
      )}
    </div>
  );
}
