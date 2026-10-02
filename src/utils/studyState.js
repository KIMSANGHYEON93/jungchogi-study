// 학습 상태(일차 완료 · 북마크)의 공유 저장소.
//
// 로드맵 화면과 레슨 화면이 같은 값을 보도록 한 곳에서 읽고 쓴다. `useSyncExternalStore` 로 구독하므로
// 한쪽에서 바꾸면 다른 쪽이 즉시 따라오고, 다른 탭의 변경도 `storage` 이벤트로 반영된다.
//
// 안전 장치
//  - 저장값이 깨졌거나(JSON 오류) 형식이 틀리면 빈 상태로 취급한다. 원본 문자열은 지우지 않는다.
//  - localStorage 접근 자체가 막혀 있어도(사생활 보호 모드 등) 앱은 죽지 않고 메모리에서만 동작한다.
//  - 용량 초과·쓰기 실패는 `saveFailed` 로 알려 화면이 경고할 수 있게 한다.
//  - 완료는 `roadmap_checks` 키를 그대로 쓴다 — 기존 로드맵 기록이 유지된다.
//  - 북마크는 `bookmarks` 키 하나에 `{ '<종류>:<id>': 북마크한 시각(ms) }` 로 모은다. 종류는 domain/bookmarks.js.
//    처음 만든 `lesson_bookmarks`({레슨id: true}) 기록은 불러올 때 한 번 옮긴다.

import { saveProgress } from './storage';

export const CHECKS_KEY = 'roadmap_checks';
export const BOOKMARKS_KEY = 'bookmarks';
const LEGACY_LESSON_BOOKMARKS_KEY = 'lesson_bookmarks';
const PREFIX = 'jungchogi_';

/** 값이 정확히 true 인 항목만 남긴 새 객체. 깨진 입력은 {} 가 된다. */
export function normalizeFlags(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) if (v === true) out[k] = true;
  return out;
}

/** 북마크 맵 정규화: `종류:id` 모양의 키와 유한한 시각(또는 옛 형식의 true → 0)만 남긴다. */
export function normalizeBookmarks(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!/^[A-Za-z0-9]+:.+/.test(k)) continue;
    if (v === true) out[k] = 0;
    else if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

export const bookmarkKey = (type, id) => `${type}:${id}`;

/** 맵 → [{type, id, addedAt}] 최근에 한 것부터 */
export function bookmarkEntries(map) {
  return Object.entries(map)
    .map(([k, addedAt]) => {
      const i = k.indexOf(':');
      return { type: k.slice(0, i), id: k.slice(i + 1), addedAt };
    })
    .sort((a, b) => b.addedAt - a.addedAt || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
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

function parseBookmarks(raw) {
  if (!raw) return {};
  try {
    return normalizeBookmarks(JSON.parse(raw));
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
    snapshot = { checks: parseFlags(raw[0]), bookmarks: parseBookmarks(raw[1]), saveFailed };
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

export function toggleDone(d) {
  const next = { ...getSnapshot().checks };
  const id = String(d);
  if (next[id]) delete next[id];
  else next[id] = true;
  write(CHECKS_KEY, 'checks', next);
}

/** @param {string} type domain/bookmarks.js 의 종류 · @param {string} id 그 종류 안의 id */
export function toggleBookmark(type, id) {
  const next = { ...getSnapshot().bookmarks };
  const key = bookmarkKey(type, id);
  if (key in next) delete next[key];
  else next[key] = Date.now();
  write(BOOKMARKS_KEY, 'bookmarks', next);
}

/**
 * 처음 버전의 `lesson_bookmarks`({레슨id: true})를 `bookmarks` 로 합치고 옛 키를 지운다.
 * 새 기록이 이미 있으면 거기에 합친다. 저장이 실패하면 옛 키를 남겨 다음에 다시 시도한다.
 * @returns {boolean} 옮긴 기록이 있었는지
 */
export function migrateLegacyBookmarks() {
  const legacyRaw = readRaw(LEGACY_LESSON_BOOKMARKS_KEY);
  if (!legacyRaw) return false;
  let legacy = {};
  try {
    legacy = normalizeFlags(JSON.parse(legacyRaw));
  } catch {
    return false; // 깨진 값은 그대로 둔다 — 내보내기로 복구할 여지를 남긴다
  }
  const merged = { ...parseBookmarks(readRaw(BOOKMARKS_KEY)) };
  for (const id of Object.keys(legacy)) merged[bookmarkKey('lesson', id)] ??= 0;
  try {
    if (!saveProgress(BOOKMARKS_KEY, merged)) return false;
    localStorage.removeItem(PREFIX + LEGACY_LESSON_BOOKMARKS_KEY);
  } catch {
    return false;
  }
  lastRaw = [undefined, undefined];
  return true;
}

try {
  migrateLegacyBookmarks();
} catch {
  /* 저장소 접근이 막힌 환경 — 마이그레이션은 건너뛴다 */
}

/** 테스트용 — 모듈 캐시를 비운다 */
export function resetStudyState() {
  snapshot = EMPTY;
  lastRaw = [undefined, undefined];
  saveFailed = false;
}
