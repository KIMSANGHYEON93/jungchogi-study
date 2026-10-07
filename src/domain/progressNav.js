// 문항 번호판(완료 · 미완료 표시)과 "다음 미완료로" 이동의 계산.
// 화면(코드 퀴즈 · 플래시카드 · 실기 연습)마다 무엇을 "완료"로 볼지는 다르므로
// 상태 판정은 호출하는 쪽이 statusOf 로 넘기고, 여기서는 세고 찾기만 한다.

/** 문항 하나의 상태 */
export const ITEM_STATUS = Object.freeze({
  DONE: 'done', // 완료 (정답 · 외움 · 풀이함)
  WRONG: 'wrong', // 풀었지만 틀림 · 모름
  TODO: 'todo', // 아직 안 함
});

/**
 * 상태별 개수.
 * @param {object[]} items
 * @param {(item: object) => string} statusOf
 * @returns {{done: number, wrong: number, todo: number}}
 */
export function countStatuses(items, statusOf) {
  const counts = { done: 0, wrong: 0, todo: 0 };
  for (const item of items ?? []) {
    const s = statusOf(item);
    counts[s in counts ? s : 'todo'] += 1;
  }
  return counts;
}

/**
 * 첫 번째 미완료 항목의 위치. 없으면 -1.
 * @param {object[]} items
 * @param {(item: object) => boolean} isPending
 */
export function firstPendingIndex(items, isPending) {
  return (items ?? []).findIndex((item) => isPending(item));
}

/**
 * 지금 위치 다음의 미완료 항목 위치. 끝까지 없으면 처음부터 다시 찾고,
 * 지금 항목 말고는 하나도 없으면 -1 (지금 항목은 이미 보고 있으므로 답이 아니다).
 * @param {object[]} items
 * @param {number} from 지금 위치
 * @param {(item: object) => boolean} isPending
 */
export function nextPendingIndex(items, from, isPending) {
  const list = items ?? [];
  const n = list.length;
  for (let step = 1; step < n; step += 1) {
    const i = (from + step) % n;
    if (isPending(list[i])) return i;
  }
  return -1;
}
