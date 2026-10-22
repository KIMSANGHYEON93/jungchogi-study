// 모의고사 문항 고르기 — 지난 회차에 덜 나온 문항부터.
//
// 예전에는 회차마다 같은 풀에서 무작위로 뽑아, 몇 번만 풀어도 본 문제가 또 나왔다.
// 지난 회차 기록(exam_sessions)에서 문항별로 나온 횟수를 세어 적게 나온 것부터 고르고,
// 같은 횟수끼리는 섞는다. 풀을 한 바퀴 다 돌아야 같은 문제가 다시 나온다.

/** @param {readonly unknown[]} arr @param {() => number} random */
export function shuffle(arr, random = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 지난 회차들에서 문항 id 별로 나온 횟수.
 * @param {{items?: {qid: string}[]}[]} sessions
 * @returns {Map<string, number>}
 */
export function usageCounts(sessions) {
  const counts = new Map();
  for (const s of sessions ?? []) {
    for (const it of s?.items ?? []) {
      const id = String(it?.qid);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * 풀에서 `count` 개를 덜 나온 순으로 고른다(같은 횟수끼리는 무작위).
 * @template {{id: string|number}} T
 * @param {T[]} pool
 * @param {number} count
 * @param {Map<string, number>} counts
 * @param {() => number} [random]
 * @returns {T[]}
 */
export function pickLeastUsed(pool, count, counts, random = Math.random) {
  const timesUsed = (q) => counts.get(String(q.id)) ?? 0;
  // 먼저 섞은 뒤 횟수로 안정 정렬 — 같은 횟수 안의 순서가 무작위가 된다
  return shuffle(pool, random)
    .sort((a, b) => timesUsed(a) - timesUsed(b))
    .slice(0, count);
}

/**
 * 이번 회차 구성에서 처음 보는 문항 수 — 준비 화면 안내용.
 * @param {{id: string|number}[]} pool
 * @param {Map<string, number>} counts
 */
export function unseenCount(pool, counts) {
  return pool.filter((q) => !counts.has(String(q.id))).length;
}
