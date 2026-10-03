// 캘린더에서 가져온 "일정이 많은 날"의 저장. 날짜 목록과 가져온 시각만 둔다 — 일정 제목·내용은 받지도 저장하지도 않는다.
// 대시보드의 오늘 카드(가져오기)와 로드맵 화면(표시)이 같은 값을 본다.

import { clearProgress, loadProgress, saveProgress } from './storage';

export const CALENDAR_BUSY_KEY = 'calendar_busy';

/** @returns {{busyDates: string[], syncedAt: number|null}} 없거나 손상됐으면 빈 값 */
export function loadStoredBusy() {
  const stored = loadProgress(CALENDAR_BUSY_KEY, null);
  const dates = Array.isArray(stored?.busyDates) ? stored.busyDates.filter((d) => typeof d === 'string') : [];
  return { busyDates: dates, syncedAt: typeof stored?.syncedAt === 'number' ? stored.syncedAt : null };
}

export function saveBusy(busyDates) {
  const next = { busyDates, syncedAt: Date.now() };
  saveProgress(CALENDAR_BUSY_KEY, next);
  return next;
}

export function clearBusy() {
  clearProgress(CALENDAR_BUSY_KEY);
}
