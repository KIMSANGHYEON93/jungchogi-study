import { useState } from 'react';
import { matchesExpectedOutput } from '../domain/grading';
import { getTraceNote, saveTraceNote } from '../utils/storage';

/**
 * 추적표와 정답 사이에 두는 문제별 답안지 — 나의 답(출력 결과)과 트레이싱 메모.
 * 입력할 때마다 저장하므로 다른 문제로 갔다 와도, 백업·동기화로 다른 기기에서도 남는다.
 * 다른 문제로 바꿀 때는 부모가 `key={problemId}` 를 주어 새로 읽게 한다.
 *
 * @param {{ problemId: string, expectedOutput?: string }} props
 */
export default function TraceNote({ problemId, expectedOutput }) {
  const [note, setNote] = useState(() => getTraceNote(problemId));
  const [message, setMessage] = useState('');

  function update(field, value) {
    const next = { ...note, [field]: value };
    setNote(next);
    const saved = saveTraceNote(problemId, next);
    setMessage(saved ? '' : '저장하지 못했습니다 — 저장 공간이 가득 찼습니다. 대시보드 "데이터 관리"를 확인하세요.');
  }

  function check() {
    const match = matchesExpectedOutput(note.answer, expectedOutput);
    if (note.answer.trim() === '') setMessage('나의 답을 먼저 적어 주세요.');
    else if (match === null) setMessage('자동 비교할 정답 출력이 없습니다. 아래 풀이와 직접 비교해 주세요.');
    else setMessage(match ? '정답과 일치합니다.' : '정답과 다릅니다. 아래 풀이와 비교해 보세요.');
  }

  const answerId = `trace-note-answer-${problemId}`;
  const memoId = `trace-note-memo-${problemId}`;

  return (
    <section className="card trace-note" aria-label="나의 답안">
      <label htmlFor={memoId} className="trace-note-label">트레이싱 메모</label>
      <textarea
        id={memoId}
        className="quiz-input trace-note-memo"
        rows={6}
        value={note.memo}
        placeholder={'예) i=0: j=0 → sum=1, j=2 → sum=4\n    i=1: j=1 → sum=10 …'}
        spellCheck={false}
        onChange={(e) => update('memo', e.target.value)}
      />
      <label htmlFor={answerId} className="trace-note-label">나의 답 (출력 결과)</label>
      <div className="trace-note-row">
        <textarea
          id={answerId}
          className="quiz-input trace-note-answer"
          rows={2}
          value={note.answer}
          placeholder="실행 결과를 그대로 적으세요"
          spellCheck={false}
          onChange={(e) => update('answer', e.target.value)}
        />
        <button type="button" className="btn-primary" onClick={check}>
          내 답 확인
        </button>
      </div>
      <p className="trace-status" role="status">
        {message}
      </p>
    </section>
  );
}
