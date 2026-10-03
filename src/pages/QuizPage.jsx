import { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import { parseCodeDrill } from '../utils/parseCodeDrill';
import {
  saveProgress,
  loadProgress,
  addWrongNote,
  getWrongNotes,
  removeWrongNote,
} from '../utils/storage';
import useStudyTimer from '../hooks/useStudyTimer';
import { fetchMarkdown } from '../utils/mdCache';
import Icon from '../components/Icon';
import BookmarkButton from '../components/ui/BookmarkButton';
import { BOOKMARK_TYPE } from '../domain/bookmarks';
import useStudyState from '../hooks/useStudyState';
import CodeTracingTable from '../components/CodeTracingTable';
import { traceFor } from '../domain/traces';
import ProblemContext from '../components/ProblemContext';
import {
  QUIZ_RESULT,
  matchesExpectedOutput,
  summarizeQuizResults,
  withQuizResult,
} from '../domain/grading';
import { useThemeContext } from '../hooks/useTheme';
import {
  useDeepLinkId,
  useDeepLinkedIndex,
  deckDeepLinkNotice,
  DEEP_LINK_NOTICE_STYLE,
} from '../hooks/useDeepLink';

const LANGS = ['전체', 'c', 'java', 'python', 'sql'];
const LANG_LABEL = { 전체: '전체', c: 'C', java: 'Java', python: 'Python', sql: 'SQL' };

const SELF_GRADE_STATE = {
  [QUIZ_RESULT.CORRECT]: '정답으로 기록됨',
  [QUIZ_RESULT.INCORRECT]: '오답으로 기록됨',
};

export default function QuizPage() {
  useStudyTimer();
  const { theme } = useThemeContext();
  const syntaxTheme = theme === 'dark' ? oneDark : oneLight;
  // `/quiz?id=C-07` 로 지목받은 문항. 첫 렌더에만 읽는다.
  const requestedId = useDeepLinkId();
  const [allProblems, setAllProblems] = useState([]);
  const [lang, setLang] = useState('전체');
  const [userAnswer, setUserAnswer] = useState('');
  // 정답 출력과의 자동 비교 결과: true 일치 / false 불일치 / null 비교 불가(SQL 등)
  const [autoMatch, setAutoMatch] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState({}); // { id: 'correct'|'incorrect'|'answered' }
  const [wrongIds, setWrongIds] = useState(new Set());
  const study = useStudyState();

  useEffect(() => {
    let cancelled = false;
    fetchMarkdown('정처기_코드트레이싱_드릴.md')
      .then((text) => {
        if (cancelled) return;
        setAllProblems(parseCodeDrill(text));
        setResults(loadProgress('quiz_results', {}));
        const savedWrong = getWrongNotes().filter((n) => n.source === 'quiz').map((n) => n.id);
        setWrongIds(new Set(savedWrong));
      });
    return () => { cancelled = true; };
  }, []);

  // lang 필터는 파생 상태 — effect 없이 렌더 중 계산한다
  const problems = lang === '전체' ? allProblems : allProblems.filter((p) => p.lang === lang);
  // 문항 커서. 딥링크가 지목한 문항이 목록에 있으면 거기서 시작한다.
  // 목록은 md fetch 뒤에 도착하므로 커서를 렌더 중에 파생해야 effect 없이 맞출 수 있다.
  const { index: idx, setIndex, missedId } = useDeepLinkedIndex(
    problems,
    requestedId,
    // 이어 풀기: 시도한 문항(정답·오답·미정)은 넘기고 아직 안 푼 첫 문항에서 시작한다
    (p) => !!results[p.id],
  );
  const current = problems[idx];
  const deepLinkNotice = deckDeepLinkNotice(missedId);

  const currentResults = results;
  const saveResults = (next) => {
    setResults(next);
    saveProgress('quiz_results', next);
  };

  const handleSubmit = () => {
    if (!userAnswer.trim()) return;
    setSubmitted(true);
    const match = matchesExpectedOutput(userAnswer, current.expectedOutput);
    setAutoMatch(match);
    // 일치는 확정 정답으로 바로 기록한다. 불일치는 표현 차이일 수 있어 기록하지 않고
    // 아래 자기 채점에 맡긴다.
    if (match === true) {
      saveResults(withQuizResult(currentResults, current.id, QUIZ_RESULT.CORRECT));
      return;
    }
    // 시도 자체는 바로 남긴다(진도 표시가 여기에 걸려 있다). 정오는 아직 모르므로
    // 'answered' = "시도했으나 정오 미상". 이미 채점된 문항은 덮어쓰지 않는다 —
    // 다시 풀었다고 지난 판정을 정오 미상으로 되돌리면 정보가 사라진다.
    const recorded = currentResults[current.id];
    if (recorded === QUIZ_RESULT.CORRECT || recorded === QUIZ_RESULT.INCORRECT) return;
    saveResults({ ...currentResults, [current.id]: QUIZ_RESULT.ANSWERED });
  };

  /**
   * 채점 결과를 남긴다. 자기 채점 버튼과 출력 자동 일치가 같은 길로 들어온다.
   * @param {'correct'|'incorrect'} verdict
   */
  const recordGrade = (verdict) => {
    saveResults(withQuizResult(currentResults, current.id, verdict));
  };

  const goTo = (newIdx) => {
    setIndex(newIdx);
    setUserAnswer('');
    setAutoMatch(null);
    setSubmitted(false);
  };

  // 언어를 바꾸면 첫 문제로 되돌린다 — effect 대신 이벤트 핸들러에서 리셋
  const changeLang = (l) => {
    setLang(l);
    goTo(0);
  };

  // 레거시 'answered' 를 정답으로도 오답으로도 세지 않는 셈은 도메인이 한다.
  const summary = summarizeQuizResults(results);
  const solvedCount = summary.attempted;
  const totalCount = allProblems.length;
  const currentVerdict = current ? currentResults[current.id] : undefined;

  return (
    <div className="page">
      <h1>코드 퀴즈</h1>
      <p className="subtitle">코드 트레이싱 40문제 — 출력 결과를 직접 입력하세요</p>

      <div className="stats">
        <div className="stat-box">
          <div className="value">{totalCount}</div>
          <div className="label">전체</div>
        </div>
        <div className="stat-box">
          <div className="value" style={{ color: 'var(--success)' }}>{solvedCount}</div>
          <div className="label">풀이 완료</div>
        </div>
        <div className="stat-box">
          <div className="value" style={{ color: 'var(--warning)' }}>{totalCount - solvedCount}</div>
          <div className="label">남은 문제</div>
        </div>
      </div>

      <div className="progress-bar">
        <div className="fill" style={{ width: `${totalCount ? (solvedCount / totalCount) * 100 : 0}%` }} />
      </div>

      <div className="filter-bar">
        {LANGS.map((l) => (
          <button key={l} className={`btn-outline ${lang === l ? 'active' : ''}`} onClick={() => changeLang(l)}>
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>

      {/* 지목받은 문항을 못 찾았을 때. 조용히 다른 문항을 열면 사용자는
          계획이 틀렸는지 앱이 틀렸는지 알 수 없다. */}
      {deepLinkNotice && (
        <div className="deep-link-notice" role="status" style={DEEP_LINK_NOTICE_STYLE}>
          {deepLinkNotice}
        </div>
      )}

      {problems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>문제를 불러오는 중...</div>
      ) : current ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.1rem' }}>{current.id}. {current.title}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <span className="badge badge-primary">{current.lang.toUpperCase()}</span>
              <BookmarkButton
                active={study.isBookmarked(BOOKMARK_TYPE.CODE_DRILL, current.id)}
                onToggle={() => study.toggleBookmark(BOOKMARK_TYPE.CODE_DRILL, current.id)}
                label={`${current.id} 문제 북마크`}
              />
            </div>
          </div>

          <ProblemContext text={current.context} fontSize="0.9rem" />

          <SyntaxHighlighter language={current.lang} style={syntaxTheme} customStyle={{ borderRadius: 8, fontSize: '0.9rem' }}>
            {current.code}
          </SyntaxHighlighter>

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: 8, display: 'block' }}>
              출력 결과를 입력하세요:
            </label>
            <input
              className="quiz-input"
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="예: 30 50"
              disabled={submitted}
            />
            {!submitted ? (
              <button className="btn-primary" onClick={handleSubmit} style={{ marginTop: 8 }}>정답 확인</button>
            ) : (
              <div className="quiz-result correct" style={{ marginTop: 12 }} aria-live="polite">
                {autoMatch === true ? (
                  <p className="quiz-auto-verdict match" role="status">
                    <Icon name="check-circle" size={16} /> 정답입니다 — 입력한 출력이 정답과 일치합니다.
                  </p>
                ) : autoMatch === false ? (
                  <p className="quiz-auto-verdict mismatch" role="status">
                    <Icon name="alert-circle" size={16} /> 입력한 출력이 정답과 다릅니다. 표현 차이일 수 있으니
                    풀이와 비교해 아래에서 직접 채점해 주세요.
                  </p>
                ) : null}
                <h3 style={{ marginBottom: 8, color: 'var(--success)' }}>풀이</h3>
                <div className="md-content" style={{ fontSize: '0.9rem' }}>
                  <ReactMarkdown>{current.answer}</ReactMarkdown>
                </div>
                {current.pitfall && (
                  <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(251,191,36,0.1)', borderRadius: 8, border: '1px solid var(--warning)' }}>
                    <strong style={{ color: 'var(--warning)' }}>함정:</strong> {current.pitfall}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  {wrongIds.has(current.id) ? (
                    <button
                      className="btn-outline"
                      style={{ color: 'var(--success)' }}
                      onClick={() => {
                        removeWrongNote('quiz', current.id);
                        setWrongIds((prev) => { const s = new Set(prev); s.delete(current.id); return s; });
                      }}
                    >
                      오답노트에서 제거
                    </button>
                  ) : (
                    <button
                      className="btn-danger"
                      onClick={() => {
                        addWrongNote({
                          id: current.id,
                          source: 'quiz',
                          type: 'code',
                          title: current.title,
                          context: current.context,
                          code: current.code,
                          lang: current.lang,
                          answer: current.answer,
                          pitfall: current.pitfall,
                          userAnswer: userAnswer,
                        });
                        setWrongIds((prev) => new Set(prev).add(current.id));
                      }}
                    >
                      오답노트에 추가
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 변수 추적표 — 풀이를 공개한 뒤에만 보인다(정답 출력이 이미 나와 있다). 데이터가 있는 문제만. */}
            {submitted && traceFor(current.id) ? (
              <CodeTracingTable
                key={`trace-${current.id}`}
                code={current.code}
                lang={current.lang}
                steps={traceFor(current.id).steps}
              />
            ) : null}

            {/* 자기 채점 — 출력이 달라 보여도, 틀렸어도 여기서 끝낼 수 있다 */}
            {submitted && (
              <div className="self-grade">
                <span className="self-grade-label" id={`self-grade-label-${current.id}`}>
                  직접 채점
                </span>
                <button
                  type="button"
                  className={`btn-outline self-grade-button ${currentVerdict === QUIZ_RESULT.CORRECT ? 'active' : ''}`}
                  aria-pressed={currentVerdict === QUIZ_RESULT.CORRECT}
                  onClick={() => recordGrade(QUIZ_RESULT.CORRECT)}
                >
                  맞았어요
                </button>
                <button
                  type="button"
                  className={`btn-outline self-grade-button ${currentVerdict === QUIZ_RESULT.INCORRECT ? 'active' : ''}`}
                  aria-pressed={currentVerdict === QUIZ_RESULT.INCORRECT}
                  onClick={() => recordGrade(QUIZ_RESULT.INCORRECT)}
                >
                  틀렸어요
                </button>
                <span className="self-grade-state" role="status">
                  {SELF_GRADE_STATE[currentVerdict] ?? '아직 채점하지 않음'}
                </span>
              </div>
            )}

          </div>

          <div className="flashcard-nav" style={{ marginTop: 20 }}>
            <button className="btn-outline" onClick={() => goTo(idx - 1)} disabled={idx === 0}><Icon name="chevron-left" size={16}/> 이전</button>
            <span className="flashcard-counter">{idx + 1} / {problems.length}</span>
            <button className="btn-outline" onClick={() => goTo(idx + 1)} disabled={idx === problems.length - 1}>다음 <Icon name="chevron-right" size={16}/></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
