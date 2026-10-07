// 학습 데이터 내보내기·가져오기. 화면(DashboardPage)은 이 모듈이 돌려주는 결과만 보여 준다.
//
// 왜 따로 뺐나 — 가져오기는 사용자의 진도를 통째로 바꾸는 유일한 경로다.
//  1) 파일이 손상됐거나 모양이 틀려도 그대로 쓰면 화면이 깨진다 → 쓰기 전에 **전부 검증**한다.
//  2) 중간에 실패(용량 초과 등)하면 일부 키만 바뀐 채 남는다 → 쓰기 전 값을 모아 두고 **실패하면 되돌린다**.
//  3) 폰과 PC 를 함께 쓰므로 한쪽 백업이 다른 쪽 진도를 지우면 안 된다 → 기본은 **합치기**다.
//
// 백업 형식: { schema: 1, exportedAt: ISO, data: { "jungchogi_<key>": "<저장된 원본 문자열>" } }
// 옛 형식(`jungchogi_<key>` → 문자열 평면 객체)도 읽는다.
// 테마(`jungchogi-theme`)는 기기마다 다른 취향(폰은 다크, PC 는 라이트)이라 일부러 백업에 넣지 않는다.

const PREFIX = 'jungchogi_';
export const BACKUP_SCHEMA = 1;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// ─── 키별 모양 검증과 합치기 규칙 ───────────────────────────────────────

const isFlagKey = (k) => k === 'roadmap_checks' || k === 'day_checks' || k === 'lesson_bookmarks' || k.startsWith('flashcard_known_');
const isResultKey = (k) => k === 'quiz_results' || k === 'exam_results';

/** 학습 상태 점수: 채점된 결과(correct/incorrect)가 '시도만 함(answered)' 보다 정보가 많다 */
const resultRank = (v) => (v === 'correct' || v === 'incorrect' ? 2 : v === 'answered' ? 1 : 0);

/** 저장된 값이 그 키가 기대하는 모양인지. 모르는 키는 JSON 이면 통과시킨다. */
export function isValidValue(key, value) {
  if (isFlagKey(key)) return isPlainObject(value) && Object.values(value).every((v) => typeof v === 'boolean');
  if (isResultKey(key)) return isPlainObject(value) && Object.values(value).every((v) => typeof v === 'string');
  if (key === 'bookmarks') return isPlainObject(value) && Object.values(value).every((v) => v === true || (isFiniteNumber(v) && v >= 0));
  if (key === 'study_time') return isPlainObject(value) && Object.values(value).every((v) => isFiniteNumber(v) && v >= 0);
  if (key === 'wrong_notes') {
    return Array.isArray(value) && value.every((n) => isPlainObject(n) && typeof n.source === 'string' && (typeof n.id === 'string' || isFiniteNumber(n.id)));
  }
  if (key === 'calendar_busy') {
    return isPlainObject(value) && (value.busyDates === undefined || (Array.isArray(value.busyDates) && value.busyDates.every((d) => typeof d === 'string')));
  }
  if (key === 'exam_date') return typeof value === 'string' && DATE_KEY.test(value);
  if (key === 'practice_done') {
    return isPlainObject(value) && Object.values(value).every(
      (tab) => isPlainObject(tab) && Object.values(tab).every((v) => v === 'done' || v === 'wrong')
    );
  }
  return true;
}

/** 두 기록을 합친다. `current` 가 없으면 `incoming` 을 그대로 쓴다. 같은 백업을 두 번 가져와도 결과가 같다(멱등). */
export function mergeValue(key, current, incoming) {
  if (current === undefined || current === null) return incoming;
  if (isFlagKey(key)) {
    const out = { ...current };
    for (const [id, v] of Object.entries(incoming)) out[id] = out[id] === true || v === true;
    return out;
  }
  if (isResultKey(key)) {
    const out = { ...current };
    for (const [id, v] of Object.entries(incoming)) {
      // 시각이 없어 어느 쪽이 최근인지 모른다 — 채점된 결과를 우선하고, 같은 수준이면 이 기기의 기록을 지킨다
      if (!(id in out) || resultRank(v) > resultRank(out[id])) out[id] = v;
    }
    return out;
  }
  if (key === 'bookmarks') {
    const out = { ...current };
    for (const [id, v] of Object.entries(incoming)) {
      const next = v === true ? 0 : v;
      const prev = out[id] === true ? 0 : out[id];
      out[id] = prev === undefined ? next : Math.max(prev, next);
    }
    return out;
  }
  if (key === 'study_time') {
    const out = { ...current };
    // 더하면 같은 파일을 두 번 가져올 때 두 배가 된다 — 날짜별로 큰 값을 쓴다
    for (const [d, m] of Object.entries(incoming)) out[d] = Math.max(Number(out[d]) || 0, m);
    return out;
  }
  if (key === 'wrong_notes') {
    const out = [...current];
    for (const note of incoming) {
      const i = out.findIndex((n) => n?.source === note.source && n?.id === note.id);
      if (i < 0) {
        out.push(note);
        continue;
      }
      const a = out[i];
      const aCount = Number(a.reviewCount) || 0;
      const bCount = Number(note.reviewCount) || 0;
      // 복습을 더 많이 한 쪽이 앞선 기록이다. 숙달은 한쪽이라도 했으면 유지한다.
      const base = bCount > aCount || (bCount === aCount && (Number(note.addedAt) || 0) > (Number(a.addedAt) || 0)) ? note : a;
      // 없던 키를 새로 만들지 않는다 — 같은 기록을 다시 합쳐도 저장된 모양이 달라지지 않게(멱등)
      const merged = { ...base };
      const reviews = Math.max(aCount, bCount);
      if ('reviewCount' in base || reviews > 0) merged.reviewCount = reviews;
      if (a.mastered || note.mastered) merged.mastered = true;
      out[i] = merged;
    }
    return out;
  }
  if (key === 'calendar_busy') {
    const dates = [...new Set([...(current.busyDates ?? []), ...(incoming.busyDates ?? [])])].sort();
    return { busyDates: dates, syncedAt: Math.max(Number(current.syncedAt) || 0, Number(incoming.syncedAt) || 0) || null };
  }
  if (key === 'practice_done') {
    // 실기 연습 결과: 어느 한쪽에서라도 완료했으면 완료, 아니면 이 기기의 기록을 지킨다
    const out = {};
    for (const tab of new Set([...Object.keys(current), ...Object.keys(incoming)])) {
      const merged = { ...(current[tab] ?? {}) };
      for (const [id, v] of Object.entries(incoming[tab] ?? {})) {
        if (!(id in merged) || v === 'done') merged[id] = v;
      }
      out[tab] = merged;
    }
    return out;
  }
  // 시험일 같은 설정·모르는 키: 이 기기에 값이 있으면 그것을 지킨다
  return current;
}

// ─── 내보내기 ───────────────────────────────────────────────────────────

/**
 * 지금 저장된 학습 데이터를 백업 객체로 만든다.
 * @param {Storage} [storage]
 * @param {Date} [now]
 */
export function buildBackup(storage = localStorage, now = new Date()) {
  const data = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) data[key] = storage.getItem(key);
  }
  return { schema: BACKUP_SCHEMA, exportedAt: now.toISOString(), data };
}

// ─── 읽기·검증 ──────────────────────────────────────────────────────────

/**
 * 백업 파일 내용을 읽고 검증한다. 아무것도 쓰지 않는다.
 * 모양이 틀린 키는 건너뛰고 `skipped` 로 알린다. 읽을 수 있는 키가 하나도 없으면 실패다.
 *
 * @param {string} text
 * @returns {{ok: true, schema: number, legacy: boolean, items: Record<string, unknown>, skipped: {key: string, reason: string}[]}
 *   | {ok: false, reason: 'json'|'shape'|'schema'|'empty'}}
 */
export function parseBackup(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!isPlainObject(body)) return { ok: false, reason: 'shape' };

  let data = body;
  let schema = 0;
  let legacy = true;
  if ('schema' in body || 'data' in body) {
    if (!isFiniteNumber(body.schema) || !isPlainObject(body.data)) return { ok: false, reason: 'shape' };
    // 더 새 버전이 만든 백업을 지금 앱이 잘못 읽어 덮어쓰지 않게 한다
    if (body.schema > BACKUP_SCHEMA) return { ok: false, reason: 'schema' };
    data = body.data;
    schema = body.schema;
    legacy = false;
  }

  const items = {};
  const skipped = [];
  for (const [fullKey, raw] of Object.entries(data)) {
    if (!fullKey.startsWith(PREFIX)) {
      skipped.push({ key: fullKey, reason: 'foreign' });
      continue;
    }
    const key = fullKey.slice(PREFIX.length);
    if (typeof raw !== 'string') {
      skipped.push({ key, reason: 'shape' });
      continue;
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      skipped.push({ key, reason: 'json' });
      continue;
    }
    if (!isValidValue(key, value)) {
      skipped.push({ key, reason: 'shape' });
      continue;
    }
    items[key] = value;
  }
  if (Object.keys(items).length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, schema, legacy, items, skipped };
}

// ─── 쓰기 ───────────────────────────────────────────────────────────────

/**
 * 이 기기의 현재 값. 읽을 수 없거나 모양이 틀리면 없는 것으로 본다(백업 값을 쓴다).
 * 오답노트만은 쓸 수 있는 항목을 살린다 — 깨진 항목 하나 때문에 쌓아 둔 오답을 버리면 안 된다.
 */
function readCurrent(storage, key) {
  let value;
  try {
    const raw = storage.getItem(PREFIX + key);
    if (raw === null) return undefined;
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (key === 'wrong_notes' && Array.isArray(value)) {
    return value.filter((n) => isValidValue(key, [n]));
  }
  return isValidValue(key, value) ? value : undefined;
}

/**
 * 검증된 백업을 저장소에 반영한다. 전부 성공하거나, 실패하면 원래대로 되돌린다.
 *
 * @param {Extract<ReturnType<typeof parseBackup>, {ok: true}>} parsed
 * @param {'merge'|'replace'} mode merge: 이 기기의 기록과 합친다 · replace: 백업에 있는 키를 백업 값으로 덮어쓴다(없는 키는 그대로)
 * @param {Storage} [storage]
 * @returns {{ok: true, written: number, skipped: number} | {ok: false, reason: 'quota'|'error'}}
 */
export function applyBackup(parsed, mode = 'merge', storage = localStorage) {
  const writes = new Map();
  for (const [key, incoming] of Object.entries(parsed.items)) {
    writes.set(key, mode === 'replace' ? incoming : mergeValue(key, readCurrent(storage, key), incoming));
  }

  // 되돌릴 수 있게 쓰기 전의 원본 문자열을 모아 둔다
  const before = new Map();
  for (const key of writes.keys()) {
    try {
      before.set(key, storage.getItem(PREFIX + key));
    } catch {
      return { ok: false, reason: 'error' };
    }
  }

  const done = [];
  try {
    for (const [key, value] of writes) {
      storage.setItem(PREFIX + key, JSON.stringify(value));
      done.push(key);
    }
  } catch (err) {
    for (const key of done) {
      try {
        const prev = before.get(key);
        if (prev === null) storage.removeItem(PREFIX + key);
        else storage.setItem(PREFIX + key, prev);
      } catch {
        /* 되돌리기 실패는 더 할 수 있는 일이 없다 */
      }
    }
    const quota = err?.name === 'QuotaExceededError' || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err?.code === 22 || err?.code === 1014;
    return { ok: false, reason: quota ? 'quota' : 'error' };
  }
  return { ok: true, written: writes.size, skipped: parsed.skipped.length };
}

// ─── 화면에 보일 문구 ────────────────────────────────────────────────────

const FAIL_MESSAGE = {
  json: '백업 파일을 읽을 수 없습니다. JSON 형식이 아니거나 파일이 손상됐습니다.',
  shape: '백업 파일의 구조가 올바르지 않습니다. 이 앱에서 내보낸 파일인지 확인해 주세요.',
  schema: '이 앱보다 새 버전에서 만든 백업이라 가져올 수 없습니다. 앱을 새로고침해 최신 버전으로 열어 보세요.',
  empty: '가져올 수 있는 학습 데이터가 파일에 없습니다.',
  quota: '브라우저 저장 공간이 부족해 가져오지 못했습니다. 기존 데이터는 그대로입니다. 불필요한 데이터를 정리한 뒤 다시 시도해 주세요.',
  error: '저장 중 오류가 나서 가져오지 못했습니다. 기존 데이터는 그대로입니다.',
};

/** parseBackup / applyBackup 의 실패 결과를 사용자 문구로 */
export function failureMessage(reason) {
  return FAIL_MESSAGE[reason] ?? FAIL_MESSAGE.error;
}

/** 가져오기 성공 문구 */
export function successMessage(result, mode) {
  const verb = mode === 'replace' ? '덮어썼' : '합쳤';
  const skipped = result.skipped > 0 ? ` (읽을 수 없는 ${result.skipped}개 항목은 건너뛰었습니다)` : '';
  return `${result.written}개 항목을 ${verb}습니다${skipped}.`;
}
