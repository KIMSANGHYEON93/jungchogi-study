// 진행 중인 모의고사(문항 · 답안 · 마감 시각)를 잠시 보관한다.
//
// 휴대폰에서 150분 동안 풀다 보면 새로고침 · 다른 탭 이동 · 브라우저가 백그라운드 탭을 비우는 일이
// 생긴다. 예전에는 그때마다 답안과 타이머가 통째로 사라졌다. 이 기기에서 이어 풀기 위한 임시 값이라
// 백업 · Drive 동기화 대상(`jungchogi_` 접두사)에 넣지 않는다 — 테마 키와 같은 `jungchogi-` 접두사다.

export const EXAM_DRAFT_KEY = 'jungchogi-exam-draft';

/**
 * @typedef {{
 *   v: 1,
 *   phase: 'exam'|'result',
 *   items: {type: 'quiz'|'code', id: string|number, topic?: string}[],
 *   answers: Record<number, string>,
 *   currentQ: number,
 *   endTime: number,
 *   sessionId: string|null,
 * }} ExamDraft
 */

/** @returns {ExamDraft|null} 모양이 틀리면 null */
export function loadExamDraft(storage = localStorage) {
  try {
    const d = JSON.parse(storage.getItem(EXAM_DRAFT_KEY) ?? 'null');
    if (!d || d.v !== 1 || (d.phase !== 'exam' && d.phase !== 'result')) return null;
    if (!Array.isArray(d.items) || d.items.length === 0 || !Number.isFinite(d.endTime)) return null;
    return { ...d, answers: d.answers && typeof d.answers === 'object' ? d.answers : {}, currentQ: Number(d.currentQ) || 0 };
  } catch {
    return null;
  }
}

export function saveExamDraft(draft, storage = localStorage) {
  try {
    storage.setItem(EXAM_DRAFT_KEY, JSON.stringify({ v: 1, ...draft }));
  } catch {
    // 저장 공간이 없거나 막혀 있어도 시험은 계속된다 — 이어 풀기만 못 할 뿐이다
  }
}

export function clearExamDraft(storage = localStorage) {
  try {
    storage.removeItem(EXAM_DRAFT_KEY);
  } catch {
    // 위와 같다
  }
}

/**
 * 보관해 둔 문항 목록을 문제 풀에서 다시 찾는다. 콘텐츠가 바뀌어 하나라도 없으면 null(복원 포기).
 * @returns {object[]|null}
 */
export function restoreQuestions(draft, quizPool, codePool) {
  const find = ({ type, id, topic }) => {
    const q = (type === 'code' ? codePool : quizPool).find((x) => String(x.id) === String(id));
    // 회차별 모의고사의 '기출 주제' 표시도 되살린다
    return q && topic ? { ...q, pastTopic: topic } : q;
  };
  const questions = draft.items.map(find);
  return questions.every(Boolean) ? questions : null;
}
