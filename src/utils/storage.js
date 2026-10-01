const PREFIX = 'jungchogi_';

// 브라우저마다 용량 초과 예외의 name/code 가 다르다.
// 용량 초과만 흡수하고 그 밖의 예외(사생활 보호 모드의 SecurityError 등)는
// 원인을 감추지 않도록 그대로 전파한다.
function isQuotaExceeded(err) {
  return (
    !!err &&
    (err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014)
  );
}

// 저장 성공 여부를 돌려준다. 용량이 꽉 차도 앱을 죽이지 않는다 —
// 대시보드 "데이터 관리"의 용량 표시가 사용자에게 보이는 경고 경로다.
export function saveProgress(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data));
    return true;
  } catch (err) {
    if (!isQuotaExceeded(err)) throw err;
    console.warn(
      `[storage] ${PREFIX + key} 저장 실패: localStorage 용량 초과. ` +
        '대시보드 "데이터 관리"에서 내보내기 후 초기화가 필요합니다.',
      err
    );
    return false;
  }
}

export function loadProgress(key, fallback = null) {
  const raw = localStorage.getItem(PREFIX + key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    // 손상된 값을 조용히 삼키면 진행 상황이 소리 없이 사라진 것처럼 보인다.
    // 값 자체는 지우지 않는다 — "데이터 관리 → 내보내기"로 복구할 여지를 남긴다.
    console.warn(
      `[storage] ${PREFIX + key} 값이 손상돼 읽지 못했습니다. 기본값으로 대체합니다.`,
      err
    );
    return fallback;
  }
}

export function clearProgress(key) {
  localStorage.removeItem(PREFIX + key);
}

// ─── 마이그레이션: flashcard_known → flashcard_known_quiz100 ───
(function migrateFlashcardKey() {
  const oldKey = 'jungchogi_flashcard_known';
  const newKey = 'jungchogi_flashcard_known_quiz100';
  // 이 코드는 **모듈 import 시점**에 돈다. 쿠키·사이트 데이터가 차단된 브라우저에서는
  // localStorage 접근만으로 SecurityError 가 나는데, 여기서 던지면 번들이 로드되다
  // 터져서 화면이 통째로 하얘진다. 마이그레이션 실패는 그만한 값이 아니다 —
  // 저장이 안 되는 환경이면 어차피 옮길 진도도 없다.
  try {
    if (localStorage.getItem(oldKey) && !localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, localStorage.getItem(oldKey));
    }
  } catch (err) {
    console.warn('[storage] flashcard_known 마이그레이션을 건너뜁니다.', err);
  }
})();

// ─── 오답노트 ───

const WRONG_NOTES_KEY = 'wrong_notes';

// 복습 횟수는 간격 반복 인덱스로 쓰이므로 숫자여야 한다.
// 구버전 데이터에는 없고, 손으로 고친 내보내기 파일에는 문자열이 들어 있기도 하다.
function toReviewCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

// `loadProgress` 는 저장값이 `null` 이면 fallback 이 아니라 null 을 그대로 돌려준다
// (`JSON.parse('null')` 은 예외가 아니다). 구버전 형식이나 수기 편집으로 배열이 아닌
// 값이 들어 있는 경우도 있다. 오답노트를 읽는 쪽이 전부 배열을 전제하므로
// **여기 한 곳에서** 배열임을 보장한다 — 아니면 화면 다섯 곳이 각자 방어해야 한다.
export function getWrongNotes() {
  const notes = loadProgress(WRONG_NOTES_KEY, []);
  return Array.isArray(notes) ? notes : [];
}

export function addWrongNote(note) {
  const notes = getWrongNotes();
  // 중복 방지: 같은 source + id 조합이면 업데이트
  const existIdx = notes.findIndex((n) => n?.source === note.source && n?.id === note.id);
  const entry = {
    ...note,
    addedAt: Date.now(),
    reviewCount: 0,
    mastered: false,
  };
  if (existIdx >= 0) {
    entry.reviewCount = toReviewCount(notes[existIdx].reviewCount);
    notes[existIdx] = entry;
  } else {
    notes.push(entry);
  }
  saveProgress(WRONG_NOTES_KEY, notes);
}

export function removeWrongNote(source, id) {
  const notes = getWrongNotes().filter((n) => !(n?.source === source && n?.id === id));
  saveProgress(WRONG_NOTES_KEY, notes);
}

// 복습 완료 처리 — 타임스탬프는 addWrongNote 의 addedAt 과 마찬가지로 저장 계층이 소유한다
export function markWrongNoteReviewed(source, id) {
  const notes = getWrongNotes().map((n) =>
    n?.source === source && n?.id === id
      ? { ...n, reviewCount: toReviewCount(n.reviewCount) + 1, lastReviewed: Date.now() }
      : n
  );
  saveProgress(WRONG_NOTES_KEY, notes);
}

export function clearAllWrongNotes() {
  saveProgress(WRONG_NOTES_KEY, []);
}

// ─── D-Day ───

export function setExamDate(dateStr) {
  saveProgress('exam_date', dateStr);
}

export function getExamDate() {
  return loadProgress('exam_date', null);
}

// ─── 학습 시간 추적 ───

const STUDY_TIME_KEY = 'study_time';

// 날짜 키는 로컬 기준 YYYY-MM-DD.
// toISOString() 은 UTC 라 요일 라벨(getDay(), 로컬)과 어긋난다 —
// 한국(UTC+9)에서는 00:00~08:59 학습이 전날 칸에 쌓이는 결함이 있었다.
export function toLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 오답노트와 같은 이유로 여기서 형태를 보장한다 — 읽는 쪽(대시보드 주간 그래프,
// 플래너 스냅샷)이 전부 `{날짜: 분}` 맵을 전제한다. 배열도 맵으로 보지 않는다.
export function getStudyTimeLog() {
  const log = loadProgress(STUDY_TIME_KEY, {});
  return log !== null && typeof log === 'object' && !Array.isArray(log) ? log : {};
}

export function addStudyTime(minutes) {
  // 숫자가 아닌 값을 그대로 더하면 그날 합계가 NaN 이 되고,
  // NaN 은 JSON 에서 null 로 굳어 **이미 쌓인 분이 사라진다.**
  // 타이머 보정이 어긋나면 실제로 NaN 이 들어온다 — 그때는 아무것도 안 하는 쪽이 맞다.
  const added = Number(minutes);
  if (!Number.isFinite(added) || added <= 0) return;

  const log = getStudyTimeLog();
  const today = toLocalDateKey(new Date());
  log[today] = (Number(log[today]) || 0) + added;
  saveProgress(STUDY_TIME_KEY, log);
}

export function getWeeklyStudyTime() {
  const log = getStudyTimeLog();
  const result = [];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = toLocalDateKey(d);
    result.push({
      date: key,
      day: dayNames[d.getDay()],
      minutes: Number(log[key]) || 0,
    });
  }
  return result;
}

// ─── 간격 반복 (Spaced Repetition) ───

// ─── localStorage 용량 ───

export function getStorageUsage() {
  let bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(PREFIX)) {
      bytes += key.length * 2 + (localStorage.getItem(key) || '').length * 2;
    }
  }
  return bytes;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function getSpacedRepetitionDue() {
  const notes = getWrongNotes();
  const now = Date.now();
  const intervals = [1, 3, 7]; // 일 단위

  return notes.filter((n) => {
    // 노트가 아닌 값이 섞여 있어도 복습 화면이 죽지 않게 한다.
    if (!n || typeof n !== 'object') return false;
    if (n.mastered) return false;
    const lastTime = n.lastReviewed || n.addedAt;
    if (!lastTime) return true;
    const daysSince = (now - lastTime) / (1000 * 60 * 60 * 24);
    const nextInterval = intervals[Math.min(n.reviewCount, intervals.length - 1)] || 7;
    return daysSince >= nextInterval;
  });
}

// ─── 모의고사 채점 결과 (Phase 3) ───

/**
 * 모의고사 채점 결과. `quiz_results` 와 **절대 섞지 않는다.**
 *
 * `quiz_results` 는 id 만 키로 쓰는 평평한 맵이고 코드 퀴즈 40문항 진도
 * (대시보드 `quizDone/40`, 코드 퀴즈 화면의 "남은 문제")가 거기 걸려 있다.
 * 모의고사는 단답형(`042`)과 코드 드릴(`C-01`)을 섞어 내므로 같은 맵에 쓰면
 * 진도가 40 을 넘는다.
 *
 * 값은 `quiz_results` 와 **같은 세 가지**다 — `'correct'|'incorrect'|'answered'`
 * (`domain/grading.js` 의 `QUIZ_RESULT`).
 */
export const EXAM_RESULTS_KEY = 'exam_results';

/**
 * @returns {Record<string, string>} 기록이 없거나 손상됐으면 빈 맵
 */
export function getExamResults() {
  // 오답노트·학습시간과 같은 이유로 여기서 형태를 보장한다 —
  // 읽는 쪽이 전부 `{id: 상태}` 맵을 전제한다.
  // `JSON.parse('null')` 은 예외가 아니라 fallback 을 타지 않는다.
  const results = loadProgress(EXAM_RESULTS_KEY, {});
  return results !== null && typeof results === 'object' && !Array.isArray(results) ? results : {};
}

/**
 * @param {Record<string, string>} results
 * @returns {boolean} 저장 성공 여부 (용량 초과 시 false)
 */
export function saveExamResults(results) {
  return saveProgress(EXAM_RESULTS_KEY, results);
}
