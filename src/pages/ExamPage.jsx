import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { parseQuiz } from '../utils/parseQuiz';
import { parseCodeDrill } from '../utils/parseCodeDrill';
import {
  addWrongNote,
  getWrongNotes,
  removeWrongNote,
  getExamResults,
  saveExamResults,
  saveExamSession,
  recordWrongNoteRetry,
} from '../utils/storage';
import { EXAM_SPEC, MOCK_EXAM, formatMinutes } from '../domain/studyTime';
import { AREA_LABEL, areaOfExamQuestion, summarizeSession } from '../domain/planAdvice';
import useStudyTimer from '../hooks/useStudyTimer';
import { fetchMarkdown } from '../utils/mdCache';
import Icon from '../components/Icon';
import ProblemContext from '../components/ProblemContext';
import {
  QUIZ_RESULT,
  withQuizResult,
} from '../domain/grading';
import { useThemeContext } from '../hooks/useTheme';

/** 자기 채점 상태 문구 — 코드 퀴즈(QuizPage)와 같은 말을 쓴다 */
const SELF_GRADE_STATE = {
  [QUIZ_RESULT.CORRECT]: '정답으로 기록됨',
  [QUIZ_RESULT.INCORRECT]: '오답으로 기록됨',
};

/** 모의고사 문항 → 오답노트 항목 */
function examWrongNote(q, answer) {
  return {
    id: q.id,
    source: 'exam',
    type: q.type,
    question: q.type === 'quiz' ? q.question : undefined,
    title: q.type === 'code' ? q.title : undefined,
    context: q.type === 'code' ? q.context : undefined,
    code: q.type === 'code' ? q.code : undefined,
    lang: q.type === 'code' ? q.lang : undefined,
    answer: q.answer,
    pitfall: q.pitfall,
    expectedOutput: q.type === 'code' ? q.expectedOutput || undefined : undefined,
    userAnswer: answer?.trim() || '',
    category: q.category,
  };
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ExamPage() {
  useStudyTimer();
  const { theme } = useThemeContext();
  const syntaxTheme = theme === 'dark' ? oneDark : oneLight;
  const [phase, setPhase] = useState('ready'); // ready | exam | result
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(MOCK_EXAM.minutes * 60); // 실전 시험 시간
  // 이번 회차 — 문항별 영역과 직접 채점 결과. 계획(점검일 점수 · 영역별 배분)이 이 기록을 읽는다
  const [session, setSession] = useState(null);
  const [currentQ, setCurrentQ] = useState(0);
  const timerRef = useRef(null);
  const endTimeRef = useRef(null);
  const [wrongIds, setWrongIds] = useState(new Set());
  // 모의고사 채점 결과는 `exam_results` 에 쌓는다 — `quiz_results` 는 분모가 40 으로
  // 고정된 코드 퀴즈 진도를 세는 칸이라 모의고사 id 가 섞이면 진도가 어긋난다.
  const [examResults, setExamResults] = useState(getExamResults);

  // 문제 풀 로드
  const [quizPool, setQuizPool] = useState([]);
  const [codePool, setCodePool] = useState([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchMarkdown('정처기_단답형_100선.md').then(parseQuiz),
      fetchMarkdown('정처기_코드트레이싱_드릴.md').then(parseCodeDrill),
    ]).then(([quiz, code]) => {
      if (cancelled) return;
      setQuizPool(quiz.map((q) => ({ ...q, type: 'quiz' })));
      setCodePool(code.map((q) => ({ ...q, type: 'code' })));
    });
    return () => { cancelled = true; };
  }, []);

  const startExam = () => {
    // 단답형 12문제 + 코드 8문제 = 20문제 (앱이 정한 구성)
    const quizQ = shuffleArray(quizPool).slice(0, MOCK_EXAM.quizCount);
    const codeQ = shuffleArray(codePool).slice(0, MOCK_EXAM.codeCount);
    const all = shuffleArray([...quizQ, ...codeQ]);
    setQuestions(all);
    setAnswers({});
    setCurrentQ(0);
    setTimeLeft(MOCK_EXAM.minutes * 60);
    endTimeRef.current = Date.now() + MOCK_EXAM.minutes * 60 * 1000;
    const startedAt = Date.now();
    const next = {
      id: `exam-${startedAt}`,
      startedAt,
      items: all.map((q) => ({ qid: q.id, area: areaOfExamQuestion(q), verdict: null })),
    };
    setSession(next);
    saveExamSession(next);
    setPhase('exam');
  };

  // 타이머 (Date.now 기반으로 drift 보정)
  useEffect(() => {
    if (phase !== 'exam') return;
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setPhase('result');
        const savedWrong = getWrongNotes().filter((n) => n.source === 'exam').map((n) => n.id);
        setWrongIds(new Set(savedWrong));
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const submitExam = () => {
    clearInterval(timerRef.current);
    setPhase('result');
    const savedWrong = getWrongNotes().filter((n) => n.source === 'exam').map((n) => n.id);
    setWrongIds(new Set(savedWrong));
  };

  /**
   * 자기 채점 결과를 남긴다 (코드 퀴즈의 `recordGrade` 와 같은 구조).
   *
   * 쓰기 직전에 저장소를 다시 읽는다. 결과 화면에는 채점 버튼이 20문항 분 떠 있어,
   * 렌더 시점에 잡힌 맵으로 덮어쓰면 그 사이 남긴 다른 문항의 판정이 사라진다.
   *
   * @param {string} id
   * @param {'correct'|'incorrect'} verdict
   */
  const recordGrade = (id, verdict, index) => {
    const next = withQuizResult(getExamResults(), id, verdict);
    saveExamResults(next);
    setExamResults(next);
    // 채점 → 오답 저장을 한 번에: 틀렸으면 오답노트에 남기고, 오답노트에 있던 문항을 맞혔으면 복습 1회로 센다
    const q = index !== undefined ? questions[index] : null;
    if (q && verdict === QUIZ_RESULT.INCORRECT) {
      addWrongNote(examWrongNote(q, answers[index]));
      setWrongIds((prev) => new Set(prev).add(q.id));
    } else if (q && verdict === QUIZ_RESULT.CORRECT) {
      recordWrongNoteRetry('exam', q.id, true);
    }
    // 이번 회차의 그 자리 문항에도 남긴다 — 같은 id 가 다른 회차에 또 나와도 회차 점수가 섞이지 않는다
    if (session && index !== undefined) {
      const updated = { ...session, items: session.items.map((it, i) => (i === index ? { ...it, verdict } : it)) };
      setSession(updated);
      saveExamSession(updated);
    }
  };

  // 이번 회차에서 그 자리 문항의 채점 결과. 회차 기록이 없으면(옛 화면 상태) 문항별 마지막 결과로 대신한다
  const verdictAt = (i) => (session ? session.items[i]?.verdict ?? undefined : examResults[questions[i]?.id]);

  const timerClass = timeLeft < 300 ? 'timer danger' : timeLeft < 600 ? 'timer warning' : 'timer';
  const answeredCount = Object.keys(answers).filter((k) => answers[k]?.trim()).length;

  // ─── READY ───
  if (phase === 'ready') {
    return (
      <div className="page">
        <h1>모의고사</h1>
        <p className="subtitle">실전 시험 시간({formatMinutes(EXAM_SPEC.minutes)}) 타이머 + 자체 제작 문항 랜덤 {MOCK_EXAM.questions}문제</p>

        <div className="card" style={{ textAlign: 'center', padding: '60px 32px' }}>
          <div style={{ marginBottom: 16, color: 'var(--primary)' }}><Icon name="exam" size={64}/></div>
          <h2 style={{ marginBottom: 12 }}>{EXAM_SPEC.certificate} {EXAM_SPEC.stage} 모의고사 (실전 모드)</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: 8 }}>
            단답형 {MOCK_EXAM.quizCount}문제 + 코드 트레이싱 {MOCK_EXAM.codeCount}문제 = 총 {MOCK_EXAM.questions}문제 (문항당 {MOCK_EXAM.pointsEach}점, 앱이 정한 구성)
          </p>
          <p style={{ color: 'var(--text-dim)', marginBottom: 8 }}>제한 시간: {EXAM_SPEC.minutes}분 ({formatMinutes(EXAM_SPEC.minutes)}) — 실제 시험 시간과 같게</p>
          <p style={{ color: 'var(--text-dim)', marginBottom: 8 }}>합격 기준: {EXAM_SPEC.passScore}점 이상 ({EXAM_SPEC.maxScore}점 만점)</p>
          <p style={{ color: 'var(--text-dim)', marginBottom: 8, fontSize: '0.85rem' }}>
            문항 출처: 이 앱에서 만든 단답형 100선 · 코드 트레이싱 드릴에서 무작위로 고릅니다. 연도·회차별 복원 기출이 아닙니다.
          </p>
          <p style={{ color: 'var(--text-dim)', marginBottom: 32, fontSize: '0.85rem' }}>
            {EXAM_SPEC.sourceNote}. 풀이 뒤 채점 · 오답 정리에 약 {MOCK_EXAM.reviewMinutes}분을 따로 잡으세요.
          </p>

          <button className="btn-primary" onClick={startExam} style={{ fontSize: '1.1rem', padding: '14px 40px' }}
            disabled={quizPool.length === 0}>
            {quizPool.length === 0 ? '문제 로딩 중...' : '시험 시작'}
          </button>
        </div>
      </div>
    );
  }

  // ─── EXAM ───
  if (phase === 'exam') {
    const q = questions[currentQ];
    return (
      <div className="page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ marginBottom: 0 }}>모의고사</h1>
          <div className={timerClass} role="timer" aria-live="assertive" aria-label="남은 시간">{formatTime(timeLeft)}</div>
        </div>

        <div className="progress-bar" role="progressbar" aria-valuenow={Math.round((answeredCount / MOCK_EXAM.questions) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="학습 진도" style={{ marginBottom: 16 }}>
          <div className="fill" style={{ width: `${(answeredCount / MOCK_EXAM.questions) * 100}%` }} />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentQ(i)}
              style={{
                width: 36, height: 36, borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
                background: i === currentQ ? 'var(--primary)' : answers[i]?.trim() ? 'var(--bg-hover)' : 'transparent',
                color: i === currentQ ? '#fff' : answers[i]?.trim() ? 'var(--success)' : 'var(--text-dim)',
                border: `1px solid ${i === currentQ ? 'var(--primary)' : 'var(--border)'}`,
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontWeight: 700 }}>문제 {currentQ + 1} / {questions.length}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <span className={`badge ${q.type === 'code' ? 'badge-warning' : 'badge-primary'}`}>
                {q.type === 'code' ? `코드(${q.lang?.toUpperCase()})` : '단답형'}
              </span>
            </span>
          </div>

          {q.type === 'quiz' ? (
            <h2 style={{ fontSize: '1.15rem', lineHeight: 1.7, marginBottom: 16 }}>{q.question}</h2>
          ) : (
            <>
              <h3 style={{ marginBottom: 12 }}>{q.title}</h3>
              <ProblemContext text={q.context} fontSize="0.9rem" />
              <SyntaxHighlighter language={q.lang} style={syntaxTheme} customStyle={{ borderRadius: 8, fontSize: '0.9rem' }}>
                {q.code}
              </SyntaxHighlighter>
            </>
          )}

          <textarea
            className="quiz-input"
            rows={3}
            placeholder={q.type === 'code' ? '출력 결과를 입력하세요' : '정답을 입력하세요'}
            value={answers[currentQ] || ''}
            onChange={(e) => setAnswers({ ...answers, [currentQ]: e.target.value })}
            style={{ resize: 'vertical', fontFamily: q.type === 'code' ? "'JetBrains Mono', monospace" : 'inherit' }}
          />

          <div className="flashcard-nav" style={{ marginTop: 16 }}>
            <button className="btn-outline" onClick={() => setCurrentQ((c) => Math.max(0, c - 1))} disabled={currentQ === 0}>
              <Icon name="chevron-left" size={16}/> 이전
            </button>
            <span className="flashcard-counter">{answeredCount}/{questions.length} 답안 작성</span>
            <button className="btn-outline" onClick={() => setCurrentQ((c) => Math.min(questions.length - 1, c + 1))} disabled={currentQ === questions.length - 1}>
              다음 <Icon name="chevron-right" size={16}/>
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button className="btn-danger" onClick={submitExam} style={{ padding: '12px 32px' }}>시험 제출</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── RESULT ───
  const totalAnswered = Object.keys(answers).filter((k) => answers[k]?.trim()).length;
  // 점수는 직접 채점한 결과로만 센다. 예전에는 "답안을 쓴 문항 수"로 점수를 내서 다 틀려도 100점이 나왔다.
  const summary = summarizeSession(session ?? { items: [] });
  const pass = summary.complete && summary.score >= EXAM_SPEC.passScore;

  return (
    <div className="page">
      <h1>시험 결과</h1>

      <div className="card score-display">
        <div style={{ fontSize: '1rem', color: 'var(--text-dim)', marginBottom: 8 }}>
          {summary.complete ? '채점 점수' : `채점 중 — ${summary.graded}/${summary.total}문항 채점`}
        </div>
        <div className={`score ${pass ? 'pass' : 'fail'}`} role="status">
          {summary.complete ? `${summary.score}점` : `${summary.score}점 (채점한 문항까지)`}
        </div>
        <div style={{ marginTop: 12, fontSize: '1.1rem' }}>
          {!summary.complete
            ? '아래에서 문항마다 정답과 비교해 직접 채점하면 점수와 영역별 결과가 정해집니다.'
            : pass
              ? <><Icon name="party" size={24}/> 합격 기준({EXAM_SPEC.passScore}점) 이상</>
              : `합격 기준(${EXAM_SPEC.passScore}점) 미달 — 오답노트로 틀린 문항을 복습하세요`}
        </div>
        <div style={{ color: 'var(--text-dim)', marginTop: 8 }}>
          작성 답안: {totalAnswered}/{questions.length} | 미작성: {questions.length - totalAnswered}
        </div>
        {summary.graded > 0 ? (
          <div className="exam-area-summary" style={{ color: 'var(--text-dim)', marginTop: 8 }}>
            영역별 정답: {Object.entries(summary.byArea).filter(([, a]) => a.total > 0).map(([k, a]) => `${AREA_LABEL[k] ?? k} ${a.correct}/${a.graded}`).join(' · ')}
          </div>
        ) : null}
      </div>

      <h2 style={{ marginTop: 32, marginBottom: 16 }}>문제별 확인</h2>
      {questions.map((q, i) => (
        <div key={i} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>문제 {i + 1}. {q.type === 'quiz' ? q.question : q.title}</strong>
            <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <span className={`badge ${q.type === 'code' ? 'badge-warning' : 'badge-primary'}`}>
                {q.type === 'code' ? q.lang?.toUpperCase() : '단답형'}
              </span>
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ color: 'var(--text-dim)' }}>내 답안: </span>
            <span style={{ color: answers[i]?.trim() ? 'var(--text)' : 'var(--danger)' }}>
              {answers[i]?.trim() || '(미작성)'}
            </span>
          </div>
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }}>정답 확인</summary>
            {/* 정답만 펼치면 코드 문제는 지문·코드를 다시 볼 수 없어 풀이를 대조하기 어렵다 — 문제를 함께 보여 준다 */}
            <div className="exam-review-problem">
              <div className="exam-review-label">문제</div>
              {q.type === 'quiz' ? (
                <p className="exam-review-question">{q.question}</p>
              ) : (
                <>
                  <ProblemContext text={q.context} fontSize="0.9rem" />
                  <SyntaxHighlighter language={q.lang} style={syntaxTheme} customStyle={{ borderRadius: 8, fontSize: '0.85rem' }}>
                    {q.code}
                  </SyntaxHighlighter>
                </>
              )}
            </div>
            <div className="exam-review-label" style={{ marginTop: 12 }}>정답</div>
            {/* 정답 원문은 마크다운(코드 펜스·표)이라 코드 퀴즈와 같이 렌더링한다 */}
            <div className="md-content" style={{ marginTop: 4, fontSize: '0.9rem' }}>
              <ReactMarkdown>{q.answer}</ReactMarkdown>
            </div>
          </details>
          {/* 자기 채점. 카드가 20장 늘어서므로 버튼마다 문항 번호를 붙인다.
              확정분은 `exam_results` 에 쌓는다: `quiz_results` 는 코드 퀴즈 40문항의
              진도를 세는 칸이라, 모의고사가 낸 단답형 id 까지 섞이면 진도가 어긋난다. */}
          <div className="self-grade">
            <span className="self-grade-label">직접 채점</span>
            <button
              type="button"
              className={`btn-outline self-grade-button ${verdictAt(i) === QUIZ_RESULT.CORRECT ? 'active' : ''}`}
              aria-label={`맞았어요 (${q.id}번 문항)`}
              aria-pressed={verdictAt(i) === QUIZ_RESULT.CORRECT}
              onClick={() => recordGrade(q.id, QUIZ_RESULT.CORRECT, i)}
            >
              맞았어요
            </button>
            <button
              type="button"
              className={`btn-outline self-grade-button ${verdictAt(i) === QUIZ_RESULT.INCORRECT ? 'active' : ''}`}
              aria-label={`틀렸어요 (${q.id}번 문항)`}
              aria-pressed={verdictAt(i) === QUIZ_RESULT.INCORRECT}
              onClick={() => recordGrade(q.id, QUIZ_RESULT.INCORRECT, i)}
            >
              틀렸어요
            </button>
            <span className="self-grade-state" role="status">
              {verdictAt(i) === QUIZ_RESULT.INCORRECT
                ? '오답으로 기록됨 · 오답노트에 저장'
                : SELF_GRADE_STATE[verdictAt(i)] ?? '아직 채점하지 않음'}
            </span>
          </div>

          <div style={{ marginTop: 8 }}>
            {wrongIds.has(q.id) ? (
              <button
                className="btn-outline"
                style={{ color: 'var(--success)', fontSize: '0.85rem', padding: '6px 14px' }}
                onClick={() => {
                  removeWrongNote('exam', q.id);
                  setWrongIds((prev) => { const s = new Set(prev); s.delete(q.id); return s; });
                }}
              >
                오답노트에서 제거
              </button>
            ) : (
              <button
                className="btn-outline"
                style={{ color: 'var(--danger)', fontSize: '0.85rem', padding: '6px 14px' }}
                onClick={() => {
                  addWrongNote(examWrongNote(q, answers[i]));
                  setWrongIds((prev) => new Set(prev).add(q.id));
                }}
              >
                오답노트에 추가
              </button>
            )}
          </div>
        </div>
      ))}

      <div style={{ textAlign: 'center', marginTop: 32 }}>
        <button className="btn-primary" onClick={() => setPhase('ready')} style={{ padding: '14px 40px' }}>
          다시 도전
        </button>
      </div>
    </div>
  );
}
