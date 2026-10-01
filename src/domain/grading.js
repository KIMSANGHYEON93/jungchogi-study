// 채점 결과의 도메인 계층.
//
// - `quiz_results`·`exam_results` 저장값 세 가지를 읽고 쓰는 규칙을 모으고
// - 코드 퀴즈의 출력 자동 일치 판정을 둔다.
//
// 서버·네트워크 없이 순수하게 동작한다.

/**
 * `quiz_results` 에 저장되는 값. 저장소에 쌓인 고정 계약이다.
 *
 * - `correct`/`incorrect` : 채점 결과 (출력 자동 일치 + 사용자 자기 채점)
 * - `answered`            : 시도했으나 정오 미상. Phase 2 까지 쌓인 레거시 값이며,
 *                           지금도 "답을 냈지만 아직 채점하지 않은" 상태를 뜻한다.
 *                           **정답으로도 오답으로도 세면 안 된다.**
 *
 * 레거시 값에는 정오 정보가 없어 마이그레이션으로 복원할 수 없다.
 * 그래서 값을 고치는 대신 읽는 쪽이 세 값을 모두 다룬다.
 */
export const QUIZ_RESULT = {
  CORRECT: 'correct',
  INCORRECT: 'incorrect',
  /** 정오 미상 — 통계에서 정답/오답 어느 쪽으로도 세지 않는다 */
  ANSWERED: 'answered',
};

const GRADED_VALUES = [QUIZ_RESULT.CORRECT, QUIZ_RESULT.INCORRECT];

/**
 * 채점 결과 맵에 한 문항의 판정을 얹은 새 맵을 돌려준다.
 * 계약에 없는 값은 저장하지 않는다 — 읽는 쪽이 다뤄야 할 값의 가짓수를 늘리지 않는다.
 *
 * @param {Record<string, string>} results
 * @param {string} id
 * @param {'correct'|'incorrect'} quizResult
 * @returns {Record<string, string>}
 */
export function withQuizResult(results, id, quizResult) {
  const base = results && typeof results === 'object' ? results : {};
  if (!GRADED_VALUES.includes(quizResult) || typeof id !== 'string' || id === '') return base;
  return { ...base, [id]: quizResult };
}

/**
 * @typedef {Object} QuizResultsSummary
 * @property {number} attempted 답을 낸 문항 수 (세 값 모두 포함)
 * @property {number} correct
 * @property {number} incorrect
 * @property {number} graded 정오가 확정된 문항 수 (correct + incorrect)
 * @property {number} ungraded 시도했지만 정오 미상 — 레거시 `answered` 포함
 * @property {number|null} accuracy 채점된 문항만으로 낸 정답률(%). 채점분이 없으면 null
 */

/**
 * `quiz_results` 를 읽는 모든 화면이 같은 셈을 하도록 한 곳에 모은다.
 *
 * 레거시 `'answered'` 는 "시도했지만 정오 미상"이라 **정답으로도 오답으로도
 * 세지 않는다**. 정답률은 채점된 문항만으로 내고, 채점분이 하나도 없으면
 * 숫자를 만들지 않고 null 을 돌려준다(0% 로 보이면 실제와 다르다).
 *
 * 문자열이 아닌 손상된 값은 시도로도 세지 않는다.
 *
 * @param {Record<string, unknown>|null|undefined} results
 * @returns {QuizResultsSummary}
 */
export function summarizeQuizResults(results) {
  let attempted = 0;
  let correct = 0;
  let incorrect = 0;

  for (const value of Object.values(results && typeof results === 'object' ? results : {})) {
    if (typeof value !== 'string' || value === '') continue;
    attempted += 1;
    if (value === QUIZ_RESULT.CORRECT) correct += 1;
    else if (value === QUIZ_RESULT.INCORRECT) incorrect += 1;
  }

  const graded = correct + incorrect;
  return {
    attempted,
    correct,
    incorrect,
    graded,
    ungraded: attempted - graded,
    accuracy: graded === 0 ? null : Math.round((correct / graded) * 100),
  };
}

/**
 * 출력 비교용 정규화: 공백·줄바꿈을 한 칸으로 모으고, 괄호·쉼표·콜론 둘레의 공백은 없앤다.
 * `[3, 4, 5]` 와 `[3,4,5]` 를 같게 보되, `10 B` 와 `10B` 처럼 토큰이 달라지는 차이는 남긴다.
 * 대소문자는 구분한다 — `true`/`True` 는 언어마다 다른 출력이다.
 * @param {string} text
 */
function normalizeOutput(text) {
  return String(text)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*([[\]{}(),:])\s*/g, '$1');
}

/**
 * 입력한 출력이 정답 출력과 같은지.
 *
 * 일치만 확정으로 쓴다. 불일치는 표현 차이(공백·따옴표 등)일 수 있어 호출자가
 * 오답으로 기록하지 않고 사용자의 자기 채점에 맡겨야 한다.
 *
 * @param {unknown} userAnswer
 * @param {unknown} expectedOutput 비어 있으면(SQL 등 출력이 표·쿼리인 문항) 비교하지 않는다
 * @returns {boolean|null} 비교할 정답 출력이 없으면 null
 */
export function matchesExpectedOutput(userAnswer, expectedOutput) {
  if (typeof expectedOutput !== 'string' || expectedOutput.trim() === '') return null;
  if (typeof userAnswer !== 'string') return false;
  return normalizeOutput(userAnswer) === normalizeOutput(expectedOutput);
}
