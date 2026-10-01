// 학습 상태(일차 완료 · 레슨 북마크)의 공유 저장소.
//
// 로드맵 화면과 레슨 화면이 같은 값을 보도록 한 곳에서 읽고 쓴다. `useSyncExternalStore` 로 구독하므로
// 한쪽에서 바꾸면 다른 쪽이 즉시 따라오고, 다른 탭의 변경도 `storage` 이벤트로 반영된다.
//
// 안전 장치
//  - 저장값이 깨졌거나(JSON 오류) 형식이 틀리면 빈 상태로 취급한다. 원본 문자열은 지우지 않는다.
//  - localStorage 접근 자체가 막혀 있어도(사생활 보호 모드 등) 앱은 죽지 않고 메모리에서만 동작한다.
//  - 용량 초과·쓰기 실패는 `saveFailed` 로 알려 화면이 경고할 수 있게 한다.
//  - 완료는 `roadmap_checks` 키를 그대로 쓴다 — 기존 로드맵 기록이 유지된다.

import { saveProgress } from './storage';

export const CHECKS_KEY = 'roadmap_checks';
export const BOOKMARKS_KEY = 'lesson_bookmarks';
const PREFIX = 'jungchogi_';

/** 값이 정확히 true 인 항목만 남긴 새 객체. 깨진 입력은 {} 가 된다. */
export function normalizeFlags(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) if (v === true) out[k] = true;
  return out;
}

function readRaw(key) {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function parseFlags(raw) {
  if (!raw) return {};
  try {
    return normalizeFlags(JSON.parse(raw));
  } catch {
    return {};
  }
}

const EMPTY = Object.freeze({ checks: {}, bookmarks: {}, saveFailed: false });

let snapshot = EMPTY;
let lastRaw = [undefined, undefined];
let saveFailed = false;
const listeners = new Set();

/** 저장된 원본이 바뀐 경우에만 새 스냅샷을 만든다 — 같은 값이면 같은 참조를 돌려줘 불필요한 렌더를 막는다. */
export function getSnapshot() {
  const raw = [readRaw(CHECKS_KEY), readRaw(BOOKMARKS_KEY)];
  if (raw[0] !== lastRaw[0] || raw[1] !== lastRaw[1]) {
    lastRaw = raw;
    snapshot = { checks: parseFlags(raw[0]), bookmarks: parseFlags(raw[1]), saveFailed };
  }
  return snapshot;
}

function emit() {
  for (const l of listeners) l();
}

export function subscribe(listener) {
  listeners.add(listener);
  const onStorage = (e) => {
    if (e.key === null || e.key === PREFIX + CHECKS_KEY || e.key === PREFIX + BOOKMARKS_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function write(key, field, next) {
  let ok = false;
  try {
    ok = saveProgress(key, next);
  } catch {
    ok = false;
  }
  saveFailed = !ok;
  if (ok) {
    lastRaw = [undefined, undefined]; // 다음 getSnapshot 에서 다시 읽는다
  } else {
    // 저장은 실패했지만 이번 세션 동안은 화면이 바뀐 값을 보여준다
    snapshot = { ...getSnapshot(), [field]: next, saveFailed: true };
  }
  emit();
}

function toggle(key, field, id) {
  const current = getSnapshot()[field];
  const next = { ...current };
  if (next[id]) delete next[id];
  else next[id] = true;
  write(key, field, next);
}

export const toggleDone = (d) => toggle(CHECKS_KEY, 'checks', String(d));
export const toggleBookmark = (lessonId) => toggle(BOOKMARKS_KEY, 'bookmarks', String(lessonId));

/** 테스트용 — 모듈 캐시를 비운다 */
export function resetStudyState() {
  snapshot = EMPTY;
  lastRaw = [undefined, undefined];
  saveFailed = false;
}
