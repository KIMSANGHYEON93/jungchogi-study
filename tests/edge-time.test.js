// @vitest-environment jsdom
//
// 시간 경우의 수 하드닝.
//
// 이 앱은 날짜를 **로컬(한국) 기준으로 통일**했다. 날짜 키가 UTC 로 밀리면 학습 시간이
// 전날 칸에 쌓이는 식으로 조용히 틀린다.
//
// 훑는 축: 자정 경계 · 시계가 뒤로 간 경우.
//
// 테스트 시간대는 `vite.config.js` 가 Asia/Seoul 로 고정한다 (CI 는 UTC 라
// 고정하지 않으면 로컬 = UTC 가 되어 이 회귀를 걸러내지 못한다).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  toLocalDateKey,
  addStudyTime,
  getStudyTimeLog,
  getWeeklyStudyTime,
  getSpacedRepetitionDue,
} from '../src/utils/storage.js';

const NOTES_KEY = 'jungchogi_wrong_notes';
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('테스트 시간대 전제', () => {
  it('Asia/Seoul 로 고정돼 있다 (아니면 아래 기대값이 무의미하다)', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Seoul');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 자정 경계
// ─────────────────────────────────────────────────────────────────────────────

describe('자정 경계', () => {
  it.each([
    ['자정 1밀리초 전', '2026-09-04T14:59:59.999Z', '2026-09-04'],
    ['자정 정각', '2026-09-04T15:00:00.000Z', '2026-09-05'],
    ['자정 1밀리초 후', '2026-09-04T15:00:00.001Z', '2026-09-05'],
    ['새벽 3시', '2026-09-04T18:00:00.000Z', '2026-09-05'],
  ])('%s: 화면의 날짜 키가 로컬 기준으로 넘어간다', (_label, iso, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    expect(toLocalDateKey()).toBe(expected);
  });

  it('학습 시간은 자정을 넘기면 다음 날 칸에 쌓인다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T14:50:00.000Z')); // 23:50 KST
    addStudyTime(10);
    vi.setSystemTime(new Date('2026-09-04T15:10:00.000Z')); // 00:10 KST (다음 날)
    addStudyTime(20);

    expect(getStudyTimeLog()).toEqual({ '2026-09-04': 10, '2026-09-05': 20 });
  });

  it('주간 통계는 자정 직후에도 7일치 서로 다른 날짜를 준다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T15:00:00.000Z')); // 00:00 KST
    const week = getWeeklyStudyTime();

    expect(week).toHaveLength(7);
    expect(new Set(week.map((d) => d.date)).size).toBe(7);
    expect(week.at(-1).date).toBe('2026-09-05');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 시계가 뒤로 갔을 때
// ─────────────────────────────────────────────────────────────────────────────

describe('시계가 뒤로 간 경우', () => {
  const futureNote = (overrides = {}) => ({
    source: 'quiz100',
    id: '001',
    reviewCount: 0,
    mastered: false,
    addedAt: Date.now() + 30 * DAY, // 미래에 추가된 것으로 기록됨
    ...overrides,
  });

  it('미래 시각이 찍힌 노트를 복습 대기로 잡지 않는다', () => {
    localStorage.setItem(NOTES_KEY, JSON.stringify([futureNote()]));
    expect(getSpacedRepetitionDue()).toEqual([]);
  });

  it('학습 시간을 되돌려도 지난 날 기록을 덮어쓰지 않는다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T02:00:00.000Z'));
    addStudyTime(30);
    vi.setSystemTime(new Date('2026-09-04T02:00:00.000Z')); // 하루 뒤로
    addStudyTime(15);

    expect(getStudyTimeLog()).toEqual({ '2026-09-05': 30, '2026-09-04': 15 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 지난 시험일
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 계획 저장의 날짜 키
// ─────────────────────────────────────────────────────────────────────────────
