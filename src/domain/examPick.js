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

/**
 * 회차별 모의고사 — 그 회차의 주제 구성(이론 · SQL · 언어별 코드)을 그대로 따라 문항을 고른다.
 * 주제에 이어 둔 앱 문항이 있으면 그것을, 코드 주제(`code:c` 등)는 같은 언어의 덜 나온 드릴 문항을,
 * 이어 둔 문항이 없거나 이미 고른 문항이면 같은 영역(코드 → 같은 언어, 이론 → 이론)의 덜 나온 문항으로 채운다.
 *
 * @param {{topics: {label: string, ref: string|null}[]}} exam
 * @param {{id: string|number, type: 'quiz'}[]} quizPool
 * @param {{id: string, type: 'code', lang: string}[]} codePool
 * @param {Map<string, number>} counts 지난 회차들에서 나온 횟수
 * @param {() => number} [random]
 * @returns {{question: object, topic: string}[]} 회차 문항 순서 그대로
 */
export function buildPastExam(exam, quizPool, codePool, counts, random = Math.random) {
  const used = new Set();
  const take = (pool) => {
    const q = pickLeastUsed(pool.filter((x) => !used.has(`${x.type}:${x.id}`)), 1, counts, random)[0];
    if (q) used.add(`${q.type}:${q.id}`);
    return q;
  };
  const picked = [];
  for (const topic of exam.topics) {
    const ref = topic.ref;
    let q = null;
    if (typeof ref === 'string' && ref.startsWith('code:')) {
      const lang = ref.slice(5);
      q = take(codePool.filter((c) => c.lang === lang)) ?? take(codePool);
    } else {
      const direct = ref ? quizPool.find((x) => String(x.id) === ref) : null;
      if (direct && !used.has(`quiz:${direct.id}`)) {
        used.add(`quiz:${direct.id}`);
        q = direct;
      } else {
        q = take(quizPool);
      }
    }
    if (q) picked.push({ question: q, topic: topic.label });
  }
  return picked;
}
