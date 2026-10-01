import { useMemo, useState } from 'react';

/** 빈 값(null/undefined)은 "아직 정해지지 않은 변수" — 표에는 '-' 로 고정해 보여준다 */
function isUnset(value) {
  return value === null || value === undefined;
}

/** 입력 비교는 공백을 모두 지운 문자열 비교 — `{1, 2}` 와 `{1,2}` 를 같은 답으로 본다 */
function squash(text) {
  return String(text).replace(/\s+/g, '');
}

const LANG_LABEL = { c: 'C', java: 'Java', python: 'Python' };

/**
 * 코드 트레이싱 표 — 변수가 줄마다 어떻게 바뀌는지 step 단위로 보여주고, 직접 채워 채점도 한다.
 *
 * 모드 두 개: '트레이싱 보기'(이전/다음으로 한 칸씩 공개, 현재 줄 강조) /
 * '직접 채워보기'(변수 칸을 비워 두고 채점). 상태는 전부 컴포넌트 안에만 두므로
 * 다른 문제로 바꿀 때는 부모가 `key={problemId}` 를 주어 새로 시작하게 한다.
 *
 * @param {{
 *   code?: string,
 *   lang?: 'c'|'java'|'python',
 *   steps: {step: number, line: number, variables: Record<string, string|number|null>, output?: string}[]
 * }} props
 */
export default function CodeTracingTable({ code = '', lang, steps }) {
  const [mode, setMode] = useState('trace');
  const [cursor, setCursor] = useState(0); // 트레이싱 모드에서 공개된 마지막 step 의 인덱스
  const [showAll, setShowAll] = useState(false);
  const [inputs, setInputs] = useState({});
  const [graded, setGraded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState('');

  const rows = useMemo(() => (Array.isArray(steps) ? steps : []), [steps]);

  // 모든 step 에 나온 변수명의 합집합, 처음 등장한 순서대로
  const varNames = useMemo(() => {
    const seen = new Set();
    for (const s of rows) for (const name of Object.keys(s.variables ?? {})) seen.add(name);
    return [...seen];
  }, [rows]);

  const codeLines = useMemo(() => (code ? code.split('\n') : []), [code]);

  if (rows.length === 0 || varNames.length === 0) {
    return <p className="trace-empty">이 문제는 아직 실행 추적 데이터가 없습니다.</p>;
  }

  const lastIdx = rows.length - 1;
  const inFill = mode === 'fill';
  const visibleRows = inFill || showAll ? rows : rows.slice(0, cursor + 1);
  const current = !inFill && !showAll ? rows[cursor] : null;

  const cellKey = (rowIdx, name) => `${rowIdx}:${name}`;
  const expectedOf = (rowIdx, name) => {
    const v = rows[rowIdx].variables?.[name];
    return isUnset(v) ? null : String(v);
  };

  // 채점 대상 칸 = 값이 정해진 칸만 ('-' 고정 칸은 제외)
  const gradable = [];
  rows.forEach((_, i) => {
    for (const name of varNames) if (expectedOf(i, name) !== null) gradable.push([i, name]);
  });
  const isCorrect = (i, name) => squash(inputs[cellKey(i, name)] ?? '') === squash(expectedOf(i, name));

  function switchMode(next) {
    if (next === mode) return;
    setMode(next);
    setMessage(next === 'trace' ? '트레이싱 보기로 전환했습니다.' : '직접 채워보기로 전환했습니다.');
  }

  function goto(next) {
    const idx = Math.min(Math.max(next, 0), lastIdx);
    setShowAll(false);
    setCursor(idx);
    setMessage(`step ${rows[idx].step} / ${rows.length} · ${rows[idx].line}번째 줄`);
  }

  function expandAll() {
    setShowAll(true);
    setCursor(lastIdx);
    setMessage(`전체 ${rows.length}개 step 을 모두 펼쳤습니다.`);
  }

  function onInput(i, name, value) {
    setInputs((prev) => ({ ...prev, [cellKey(i, name)]: value }));
    // 고치면 이전 채점 표시는 낡은 정보가 되므로 지운다
    setGraded(false);
    setRevealed(false);
  }

  function grade() {
    const right = gradable.filter(([i, name]) => isCorrect(i, name)).length;
    setGraded(true);
    setRevealed(false);
    setMessage(`${right}/${gradable.length} 정답`);
  }

  function reveal() {
    setRevealed(true);
    setGraded(false);
    setMessage('정답을 공개했습니다.');
  }

  function resetFill() {
    setInputs({});
    setGraded(false);
    setRevealed(false);
    setMessage('입력을 초기화했습니다.');
  }

  function renderVarCell(i, name) {
    const expected = expectedOf(i, name);
    if (!inFill) {
      return (
        <td key={name} className={expected === null ? 'trace-cell trace-cell--unset' : 'trace-cell'}>
          {expected === null ? '-' : expected}
        </td>
      );
    }
    if (expected === null) {
      return (
        <td key={name} className="trace-cell trace-cell--unset">
          -
        </td>
      );
    }
    const value = revealed ? expected : (inputs[cellKey(i, name)] ?? '');
    let state = '';
    if (graded) state = isCorrect(i, name) ? ' trace-cell--ok' : ' trace-cell--bad';
    if (revealed) state = ' trace-cell--revealed';
    return (
      <td key={name} className={`trace-cell${state}`}>
        <input
          className="quiz-input trace-input"
          type="text"
          value={value}
          readOnly={revealed}
          aria-label={`step ${rows[i].step} ${name}`}
          aria-invalid={graded && !isCorrect(i, name) ? 'true' : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onInput(i, name, e.target.value)}
        />
      </td>
    );
  }

  return (
    <div className="trace card">
      <div className="trace-modes" role="group" aria-label="트레이싱 모드">
        <button
          type="button"
          className={mode === 'trace' ? 'btn-primary' : 'btn-outline'}
          aria-pressed={mode === 'trace'}
          onClick={() => switchMode('trace')}
        >
          트레이싱 보기
        </button>
        <button
          type="button"
          className={mode === 'fill' ? 'btn-primary' : 'btn-outline'}
          aria-pressed={mode === 'fill'}
          onClick={() => switchMode('fill')}
        >
          직접 채워보기
        </button>
      </div>

      {codeLines.length > 0 && (
        <pre className="trace-code" data-lang={lang} aria-label={lang ? `${LANG_LABEL[lang] ?? lang} 코드` : '코드'}>
          {codeLines.map((text, idx) => {
            const active = current !== null && current.line === idx + 1;
            return (
              <span key={idx} className={active ? 'trace-line trace-line--active' : 'trace-line'}>
                <span className="trace-ln" aria-hidden="true">
                  {idx + 1}
                </span>
                {text}
                {'\n'}
              </span>
            );
          })}
        </pre>
      )}

      <div className="trace-scroll">
        <table className="trace-table">
          <thead>
            <tr>
              <th scope="col">step</th>
              <th scope="col">line</th>
              {varNames.map((name) => (
                <th key={name} scope="col">
                  {name}
                </th>
              ))}
              <th scope="col">output</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((s) => {
              const i = rows.indexOf(s);
              const isCurrent = current !== null && i === cursor;
              return (
                <tr key={i} className={isCurrent ? 'trace-row trace-row--current' : 'trace-row'} aria-current={isCurrent ? 'step' : undefined}>
                  <th scope="row">{s.step}</th>
                  <td className="trace-line-no">{s.line}</td>
                  {varNames.map((name) => renderVarCell(i, name))}
                  <td className="trace-output">{s.output ? <code>{s.output}</code> : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="trace-actions">
        {inFill ? (
          <>
            <button type="button" className="btn-primary" onClick={grade}>
              채점
            </button>
            <button type="button" className="btn-outline" onClick={reveal}>
              정답 보기
            </button>
            <button type="button" className="btn-outline" onClick={resetFill}>
              초기화
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-outline" onClick={() => goto(cursor - 1)} disabled={!showAll && cursor === 0}>
              이전
            </button>
            <button type="button" className="btn-primary" onClick={() => goto(cursor + 1)} disabled={!showAll && cursor === lastIdx}>
              다음
            </button>
            <button type="button" className="btn-outline" onClick={expandAll} disabled={showAll}>
              전체 보기
            </button>
          </>
        )}
      </div>

      <p className="trace-status" role="status">
        {message}
      </p>
    </div>
  );
}
