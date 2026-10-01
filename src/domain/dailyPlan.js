// 단계별 일일 학습 플랜의 도메인 계층 — 서버·AI 없이 순수하게 동작한다.
//
// 상위 원리: 시험일에서 거꾸로 계산한 "남은 일수"에 남은 학습 단위를 균등 분배한다(앞날 우선).
//  - 학습 단위 = Day01~14 학습 문서 (`studyDays.js`)
//  - Day13(시험 전날)·Day14(시험 당일)는 실제 그 날짜에 고정한다.
//  - Day01~12 중 아직 완료 체크하지 않은 것만 오늘~시험 이틀 전에 균등 분배한다.
//    → 완료 체크가 바뀌면 매번 남은 분량이 재분배되므로 "밀린 분량"이 따로 없다.
//  - 단위보다 날이 많으면 단위가 없는 날은 복습일(오답·카드·퀴즈)로 둔다.
//
// 날짜는 모두 로컬 기준 `YYYY-MM-DD` 문자열로 주고받는다 (storage 의 toLocalDateKey 와 같은 규칙).

import { STUDY_DAYS } from './studyDays';

/** 실기 시험 기준일 — 시험일을 따로 저장하지 않았을 때의 기본값(월-일) */
export const DEFAULT_EXAM_MONTH_DAY = '10-25';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** 시험 전날·당일에 날짜로 고정되는 Day */
const PINNED_DAYS = [13, 14];
const FREE_DAYS = STUDY_DAYS.map((d) => d.day).filter((d) => !PINNED_DAYS.includes(d));

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

/**
 * n 개 단위를 k 일에 균등 분배한다. i 번째 날의 몫은 [ceil(i·n/k), ceil((i+1)·n/k)).
 * 몫의 차이는 최대 1 이고, k > n 이면 단위 없는 날이 생긴다.
 * floor 가 아니라 ceil 인 이유: floor 는 첫날 몫이 항상 비어(0 ≤ i·n/k < 1) 접속 직후
 * "오늘의 목표"가 복습일로 나온다. ceil 은 단위가 남아 있는 한 첫날부터 일을 배정한다.
 * @template T
 * @param {T[]} units
 * @param {number} k 1 이상
 * @returns {T[][]}
 */
export function splitEvenly(units, k) {
  const n = units.length;
  return Array.from({ length: k }, (_, i) =>
    units.slice(Math.ceil((i * n) / k), Math.ceil(((i + 1) * n) / k))
  );
}

/** Day 번호 → 단계(학습 국면) */
export function phaseOf(day) {
  if (day <= 8) return { key: 'learn', label: '개념 학습' };
  if (day <= 12) return { key: 'practice', label: '실전·약점 보강' };
  return { key: 'final', label: '시험 마무리' };
}

const DAY_BY_NUMBER = new Map(STUDY_DAYS.map((d) => [d.day, d]));

function unitOf(day) {
  const meta = DAY_BY_NUMBER.get(day);
  return { day, label: meta.label, phase: phaseOf(day) };
}

/**
 * @typedef {Object} ScheduleEntry
 * @property {string} date YYYY-MM-DD
 * @property {number} dDay 그날 기준 남은 일수 (시험 당일 0)
 * @property {{day:number,label:string,phase:{key:string,label:string}}[]} units 그날 목표 학습 단위
 * @property {'study'|'review'|'exam'} kind 단위가 없으면 'review', 시험 당일은 'exam'
 * @property {boolean} busy 캘린더에서 가져온 "바쁜 날"이라 새 Day 를 배정하지 않았는지
 */

/**
 * @typedef {Object} DailyPlan
 * @property {'ok'|'no-date'|'exam-passed'|'all-done'} status
 * @property {string|null} examDate
 * @property {boolean} isDefaultExamDate
 * @property {number|null} daysLeft 시험까지 남은 일수
 * @property {ScheduleEntry[]} schedule 오늘~시험일 일정 (status 'ok'·'all-done' 일 때)
 * @property {ScheduleEntry|null} today 오늘 항목
 * @property {{done:number,total:number,remaining:number,perDay:number}} progress
 *   perDay = 오늘~시험 이틀 전 사이 하루 평균 목표 단위 수(소수 첫째 자리)
 */

/**
 * 시험일·오늘·완료 체크로 오늘~시험일 일정을 만든다.
 *
 * @param {{examDate?: unknown, today: string, dayChecks?: Record<string, unknown>, busyDates?: Iterable<string>}} input
 *   `examDate` 가 없거나 형식이 틀리면 기본 시험일(10/25)을 쓴다.
 *   `busyDates` 의 날(캘린더에서 가져옴)에는 새 Day 를 배정하지 않고 나머지 날에 균등 분배한다.
 *   단, 고정일(Day13·14)은 못 옮기고, 분배할 날이 전부 바쁘면 바쁜 날을 무시한다(일정 없이 끝나지 않게).
 * @returns {DailyPlan}
 */
export function buildDailyPlan({ examDate: storedExamDate, today, dayChecks = {}, busyDates = [] }) {
  const { examDate, isDefault } = resolveExamDate(storedExamDate, today);
  const total = STUDY_DAYS.length;
  const done = STUDY_DAYS.filter((d) => dayChecks?.[d.day]).length;
  const base = {
    examDate,
    isDefaultExamDate: isDefault,
    schedule: [],
    today: null,
    progress: { done, total, remaining: total - done, perDay: 0 },
  };

  if (examDate === null) return { ...base, status: 'no-date', daysLeft: null };

  const daysLeft = daysUntil(examDate, today);
  if (daysLeft < 0) return { ...base, status: 'exam-passed', daysLeft };

  // 오늘(0) ~ 시험 당일(daysLeft) 까지 daysLeft+1 칸
  const span = daysLeft + 1;
  const dayOffsets = Array.from({ length: span }, (_, i) => i);

  // 고정 Day: 시험 당일 = Day14, 전날 = Day13. 기간이 짧아 전날이 이미 지났으면 건너뛴다.
  const pinned = new Map([[daysLeft, 14]]);
  if (daysLeft >= 1) pinned.set(daysLeft - 1, 13);

  // 분배 대상: 아직 체크 안 한 Day01~12 를 고정일을 뺀 날들에 나눈다.
  const busy = new Set(busyDates);
  const freeOffsets = dayOffsets.filter((o) => !pinned.has(o));
  // 바쁜 날을 뺀 날들에 나눈다. 전부 바쁘면 바쁜 날을 무시한다 — 분량이 사라지면 안 된다.
  const workableOffsets = freeOffsets.filter((o) => !busy.has(addDays(today, o)));
  const slotOffsets = workableOffsets.length > 0 ? workableOffsets : freeOffsets;
  const pendingFree = FREE_DAYS.filter((d) => !dayChecks?.[d]);
  const shares = slotOffsets.length > 0 ? splitEvenly(pendingFree, slotOffsets.length) : [];
  const shareByOffset = new Map(slotOffsets.map((o, i) => [o, shares[i]]));

  // 분배할 날이 하나도 없는데 남은 Day 가 있으면(시험 당일·전날뿐) 가장 이른 고정일 칸에 몰아 넣는다.
  const overflow = freeOffsets.length === 0 ? pendingFree : [];
  const overflowOffset = Math.min(...pinned.keys());

  const schedule = dayOffsets.map((offset) => {
    const date = addDays(today, offset);
    const pinnedDay = pinned.get(offset);
    const pendingPinned = pinnedDay !== undefined && !dayChecks?.[pinnedDay] ? [pinnedDay] : [];
    const dayNumbers =
      pinnedDay !== undefined
        ? [...(offset === overflowOffset ? overflow : []), ...pendingPinned]
        : shareByOffset.get(offset) ?? [];
    const kind = offset === daysLeft ? 'exam' : dayNumbers.length > 0 ? 'study' : 'review';
    return {
      date,
      dDay: daysLeft - offset,
      units: dayNumbers.map(unitOf),
      kind,
      busy: busy.has(date) && workableOffsets.length > 0,
    };
  });

  const plannedBeforeFinal = pendingFree.length;
  const spread = Math.max(slotOffsets.length, 1);
  const perDay = Math.round((plannedBeforeFinal / spread) * 10) / 10;
  const allDone = done === total;

  return {
    ...base,
    status: allDone ? 'all-done' : 'ok',
    daysLeft,
    schedule,
    today: schedule[0] ?? null,
    progress: { ...base.progress, perDay },
  };
}

/**
 * 일정에서 Day 가 배정된 날짜 항목. 완료했거나(일정에서 빠짐) 배정이 없으면 null.
 * @param {DailyPlan} plan
 * @param {number} day
 * @returns {ScheduleEntry|null}
 */
export function plannedEntryForDay(plan, day) {
  return plan.schedule.find((e) => e.units.some((u) => u.day === day)) ?? null;
}
