import { useState } from 'react';
import { matchesExpectedOutput } from '../../domain/grading';
import CodeBlock from './CodeBlock';

/**
 * 출력 예측 퀴즈 한 문항. 입력과 채점 결과는 이 컴포넌트 안에만 둔다(새로고침하면 초기화).
 * 정답 판정은 공백·줄바꿈 차이를 무시하는 grading.matchesExpectedOutput 을 쓴다.
 */
export default function QuizItem({ index, question }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null); // null | 'correct' | 'wrong'
  const inputId = `lesson-q-${question.id}`;

  const check = (e) => {
    e.preventDefault();
    if (value.trim() === '') return;
    setResult(matchesExpectedOutput(value, question.answer) ? 'correct' : 'wrong');
  };

  return (
    <li className="tw:flex tw:flex-col tw:gap-3 tw:rounded-xl tw:border tw:border-line tw:bg-card tw:p-4">
      <p className="tw:font-semibold tw:text-ink">
        <span className="tw:mr-2 tw:text-primary">Q{index + 1}.</span>
        {question.prompt}
      </p>
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
          className="tw:min-h-10 tw:cursor-pointer tw:rounded-lg! tw:border-0 tw:bg-primary tw:px-4! tw:py-0! tw:font-semibold tw:text-white tw:disabled:cursor-not-allowed tw:disabled:opacity-50"
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
              정답: <code className="tw:font-mono">{question.answer}</code>
            </span>
          ) : null}
          <p className="tw:mt-1 tw:text-dim">{question.explain}</p>
        </div>
      ) : null}
    </li>
  );
}
