// 레슨 확인 퀴즈 ↔ 오답노트 연결.
//
// 레슨 문항 id(`q1`)는 레슨 안에서만 유일하므로 오답노트에서는 `<레슨 id>:<문항 id>` 로 쓴다.
// 출처(source)는 'lesson' — 코드 퀴즈('quiz')·모의고사('exam')와 같은 저장소(`wrong_notes`)에
// 함께 쌓이고, 중복 방지·간격 반복·대시보드 집계를 그대로 탄다.

import { matchesLessonAnswer } from './lessons';

export const LESSON_SOURCE = 'lesson';

/** 레슨 트랙 → 대시보드 "오답 유형" 이름. 코드 퀴즈의 언어 이름과 맞춘다 */
const TRACK_CATEGORY = { C: 'C언어', Java: 'Java', Python: 'Python', SQL: 'SQL' };

/** 오답노트·채점 결과에서 쓰는 레슨 문항 키 */
export function lessonQuestionKey(lessonId, questionId) {
  return `${lessonId}:${questionId}`;
}

/**
 * 레슨 문항 하나의 오답 항목. 다시 풀 때 자동 채점할 수 있도록 정답 표기(`alt`·`ignoreCase`)를 함께 담는다.
 * @param {{id: string, d: number, title: string, track: string}} lesson
 * @param {{id: string, prompt: string, code?: string, lang?: string, answer: string, alt?: string[], ignoreCase?: boolean, explain: string}} question
 * @param {number} index 화면의 문항 순서(0부터)
 * @param {string} userAnswer
 */
export function buildLessonWrongNote(lesson, question, index, userAnswer) {
  return {
    id: lessonQuestionKey(lesson.id, question.id),
    source: LESSON_SOURCE,
    type: 'lesson',
    lessonId: lesson.id,
    lessonDay: lesson.d,
    questionId: question.id,
    topic: lesson.track,
    category: TRACK_CATEGORY[lesson.track] ?? lesson.track,
    title: `D-${lesson.d} ${lesson.title} · Q${index + 1}`,
    question: question.prompt,
    code: question.code,
    lang: question.lang,
    answer: question.answer,
    alt: question.alt,
    ignoreCase: question.ignoreCase,
    explain: question.explain,
    userAnswer: String(userAnswer ?? '').trim(),
  };
}

/**
 * 오답노트의 레슨 항목을 다시 풀었을 때의 자동 채점. 레슨 화면과 같은 규칙(matchesLessonAnswer)이다.
 * @param {{answer: string, alt?: string[], ignoreCase?: boolean}} note
 * @param {string} input
 */
export function gradeLessonNote(note, input) {
  return matchesLessonAnswer({ answer: note.answer, alt: note.alt, ignoreCase: note.ignoreCase }, input);
}
