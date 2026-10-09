import { useState } from 'react';
import { Link } from 'react-router-dom';
import { matchesLessonAnswer } from '../../domain/lessons';
import { buildLessonWrongNote, lessonQuestionKey, LESSON_SOURCE } from '../../domain/lessonQuiz';
import { QUIZ_RESULT } from '../../domain/grading';
import { addWrongNote, getLessonResults, recordWrongNoteRetry, saveLessonResult } from '../../utils/storage';
import CodeBlock from './CodeBlock';

const LAST_LABEL = { [QUIZ_RESULT.CORRECT]: '지난 채점: 정답', [QUIZ_RESULT.INCORRECT]: '지난 채점: 오답 — 오답노트에서 복습' };

/**
 * 출력 예측 퀴즈 한 문항. 정답 판정은 공백·줄바꿈 차이를 무시하는 grading.matchesExpectedOutput 을 쓴다.
 *
 * **채점 버튼을 눌렀을 때만** 기록한다(입력만으로는 아무것도 바뀌지 않는다).
 * - 오답 → 오답노트(`wrong_notes`, 출처 'lesson')에 남긴다. 같은 문항을 또 틀리면 새 항목 대신 틀린 횟수만 오른다.
 * - 정답 → 이 문항이 오답노트에 있으면 "다시 풀어 맞힘"(복습 1회)으로 남긴다.
 * - 마지막 결과는 `lesson_results` 에 남겨 새로고침 뒤에도 보인다.
 */
export default function QuizItem({ index, question, lesson }) {
  const key = lesson ? lessonQuestionKey(lesson.id, question.id) : null;
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null); // null | 'correct' | 'wrong'
  const [last, setLast] = useState(() => (key ? getLessonResults()[key] ?? null : null));
  const [savedWrong, setSavedWrong] = useState(false);
  const inputId = `lesson-q-${question.id}`;

  const check = (e) => {
    e.preventDefault();
    if (value.trim() === '') return;
    const correct = matchesLessonAnswer(question, value);
    setResult(correct ? 'correct' : 'wrong');
    if (!lesson) return;
    const verdict = correct ? QUIZ_RESULT.CORRECT : QUIZ_RESULT.INCORRECT;
    saveLessonResult(key, verdict);
    setLast(verdict);
    if (correct) {
      recordWrongNoteRetry(LESSON_SOURCE, key, true);
      setSavedWrong(false);
    } else {
      addWrongNote(buildLessonWrongNote(lesson, question, index, value));
      setSavedWrong(true);
    }
  };

  return (
    <li className="tw:flex tw:flex-col tw:gap-3 tw:rounded-xl tw:border tw:border-line tw:bg-card tw:p-4">
      <p className="tw:font-semibold tw:text-ink">
        <span className="tw:mr-2 tw:text-primary">Q{index + 1}.</span>
        {question.prompt}
      </p>
      {last && !result ? (
        <p className={`tw:m-0 tw:text-sm ${last === QUIZ_RESULT.CORRECT ? 'tw:text-success' : 'tw:text-danger'}`}>
          {LAST_LABEL[last]}
        </p>
      ) : null}
      {question.code ? <CodeBlock code={question.code} lang={question.lang} /> : null}
      <form onSubmit={check} className="tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row">
        <label htmlFor={inputId} className="tw:sr-only">
          Q{index + 1} 답
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setResult(null);
          }}
          placeholder="답 입력"
          autoComplete="off"
          className="tw:min-h-10 tw:flex-1 tw:rounded-lg tw:border tw:border-line tw:bg-bg tw:px-3 tw:font-mono tw:text-ink"
        />
        <button
          type="submit"
          disabled={value.trim() === ''}
          className="tw:min-h-10 tw:cursor-pointer tw:rounded-lg! tw:border-0 tw:bg-primary tw:px-4! tw:py-0! tw:font-semibold tw:text-on-fill tw:disabled:cursor-not-allowed tw:disabled:opacity-50"
        >
          채점
        </button>
      </form>
      {result ? (
        <div
          role="status"
          className={`tw:rounded-lg tw:border tw:p-3 tw:text-sm ${
            result === 'correct' ? 'tw:border-success tw:bg-success/10' : 'tw:border-danger tw:bg-danger/10'
          }`}
        >
          <strong className={result === 'correct' ? 'tw:text-success' : 'tw:text-danger'}>
            {result === 'correct' ? '정답입니다' : '오답입니다'}
          </strong>
          {result === 'wrong' ? (
            <span className="tw:ml-2 tw:text-ink">
              정답: <code className="tw:font-mono tw:whitespace-pre-wrap">{question.answer}</code>
            </span>
          ) : null}
          <p className="tw:mt-1 tw:text-dim">{question.explain}</p>
          {result === 'wrong' && savedWrong ? (
            <p className="tw:mt-1 tw:text-ink">
              오답노트에 저장했습니다. <Link to={`/wrong?id=${encodeURIComponent(key)}`} className="note-link">오답노트에서 보기</Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
