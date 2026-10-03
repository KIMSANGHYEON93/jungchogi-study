// 시험일·날짜 계산 유틸 — 서버·AI 없이 순수하게 동작한다.
//
// 학습 계획 자체는 `roadmap.js` 의 25일 로드맵 하나다. 예전에 여기 있던 "일일 플랜"(Day01~14 문서를 남은 날에
// 균등 분배)은 로드맵으로 합치면서 없앴다. 이 파일은 로드맵이 쓰는 날짜 산술과 시험일 해석만 남겼다.
//
// 날짜는 모두 로컬 기준 `YYYY-MM-DD` 문자열로 주고받는다 (storage 의 toLocalDateKey 와 같은 규칙).

/** 실기 시험 기준일 — 시험일을 따로 저장하지 않았을 때의 기본값(월-일) */
export const DEFAULT_EXAM_MONTH_DAY = '10-25';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' → UTC 자정 epoch(ms). 형식·달력이 틀리면 null (2026-02-30 같은 값 포함) */
function toEpoch(dateKey) {
  const m = typeof dateKey === 'string' ? DATE_PATTERN.exec(dateKey) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const epoch = Date.UTC(y, mo - 1, d);
  const back = new Date(epoch);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return epoch;
}

function fromEpoch(epoch) {
  const d = new Date(epoch);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `dateKey` 에서 `n` 일 뒤 날짜 (UTC 기준 산술이라 DST 에 흔들리지 않는다) */
export function addDays(dateKey, n) {
  const epoch = toEpoch(dateKey);
  return epoch === null ? null : fromEpoch(epoch + n * MS_PER_DAY);
}

/**
 * 오늘부터 시험일까지 남은 일수. 시험 당일 0, 지났으면 음수.
 * 어느 쪽 날짜든 형식이 틀리면 null.
 * @param {string|null|undefined} examDate YYYY-MM-DD
 * @param {string} today YYYY-MM-DD (로컬)
 * @returns {number|null}
 */
export function daysUntil(examDate, today) {
  const a = toEpoch(examDate);
  const b = toEpoch(today);
  if (a === null || b === null) return null;
  return Math.round((a - b) / MS_PER_DAY);
}

/**
 * 저장된 시험일이 없을 때 쓸 기본 시험일: 올해 10/25, 이미 지났으면 내년 10/25.
 * @param {string} today YYYY-MM-DD
 * @returns {string|null}
 */
export function defaultExamDate(today) {
  if (toEpoch(today) === null) return null;
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-${DEFAULT_EXAM_MONTH_DAY}`;
  return daysUntil(thisYear, today) >= 0 ? thisYear : `${year + 1}-${DEFAULT_EXAM_MONTH_DAY}`;
}

/**
 * 저장된 시험일이 유효하면 그것을, 아니면 기본값을 쓴다.
 * @param {unknown} stored
 * @param {string} today
 * @returns {{examDate: string|null, isDefault: boolean}}
 */
export function resolveExamDate(stored, today) {
  if (typeof stored === 'string' && toEpoch(stored) !== null) {
    return { examDate: stored, isDefault: false };
  }
  return { examDate: defaultExamDate(today), isDefault: true };
}
