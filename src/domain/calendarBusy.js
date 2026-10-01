// 캘린더 일정 → "어느 날이 바쁜가". 일일 플랜이 바쁜 날을 피해 분량을 나누는 입력이다.
//
// Google Calendar `events.list`(singleEvents=true) 항목의 일부 필드만 읽는다:
//   { status, transparency, start:{dateTime|date}, end:{dateTime|date}, attendees:[{self,responseStatus}] }
// 제목·장소 같은 내용은 받지도 읽지도 않는다 — 시간만 있으면 충분하다.

import { toLocalDateKey } from '../utils/storage';

/** 하루 6시간 이상 일정이 잡힌 날은 새 Day 를 배정하지 않는다 */
export const BUSY_THRESHOLD_MINUTES = 360;

const MS_PER_MINUTE = 60_000;

/** 학습 시간을 빼앗지 않는 일정인지: 취소·'한가함'으로 표시·내가 거절한 일정 */
function isIgnorable(event) {
  if (!event || typeof event !== 'object') return true;
  if (event.status === 'cancelled') return true;
  if (event.transparency === 'transparent') return true;
  const self = Array.isArray(event.attendees) ? event.attendees.find((a) => a?.self) : null;
  return self?.responseStatus === 'declined';
}

/** 종일 일정(`date` 만 있음)은 시간을 점유하지 않는 것으로 본다 — 생일·공휴일·메모가 대부분이다 */
function timedRange(event) {
  const start = Date.parse(event.start?.dateTime ?? '');
  const end = Date.parse(event.end?.dateTime ?? '');
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

/** [start, end) 를 로컬 날짜별 분으로 쪼갠다 — 자정을 넘기는 일정은 두 날에 나뉜다 */
function addMinutesByLocalDay(minutesByDate, start, end) {
  let cursor = start;
  while (cursor < end) {
    const day = new Date(cursor);
    const nextMidnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
    const sliceEnd = Math.min(end, nextMidnight);
    const key = toLocalDateKey(day);
    minutesByDate[key] = (minutesByDate[key] ?? 0) + (sliceEnd - cursor) / MS_PER_MINUTE;
    cursor = sliceEnd;
  }
}

/**
 * 같은 시간대에 겹친 일정은 한 번만 센다 — 겹친 회의 둘이 4시간이 아니라 2시간이다.
 * @param {{start: number, end: number}[]} ranges
 */
function mergeOverlaps(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/**
 * @param {unknown[]} events Google Calendar 이벤트 목록
 * @param {{thresholdMinutes?: number}} [options]
 * @returns {{busyDates: string[], minutesByDate: Record<string, number>}}
 *   minutesByDate 는 일정이 있는 날의 점유 분(반올림), busyDates 는 임계값 이상인 날(정렬)
 */
export function summarizeBusyDays(events, { thresholdMinutes = BUSY_THRESHOLD_MINUTES } = {}) {
  const ranges = (Array.isArray(events) ? events : [])
    .filter((e) => !isIgnorable(e))
    .map(timedRange)
    .filter(Boolean);

  const minutes = {};
  for (const r of mergeOverlaps(ranges)) addMinutesByLocalDay(minutes, r.start, r.end);

  const minutesByDate = Object.fromEntries(
    Object.entries(minutes).map(([date, m]) => [date, Math.round(m)])
  );
  const busyDates = Object.keys(minutesByDate)
    .filter((date) => minutesByDate[date] >= thresholdMinutes)
    .sort();
  return { busyDates, minutesByDate };
}
