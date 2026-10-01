import { describe, it, expect } from 'vitest';
import { summarizeBusyDays, BUSY_THRESHOLD_MINUTES } from '../src/domain/calendarBusy.js';
import { buildDailyPlan } from '../src/domain/dailyPlan.js';

// 테스트 시간대는 Asia/Seoul(+09:00)로 고정돼 있다 (vite.config.js)
const ev = (start, end, extra = {}) => ({
  status: 'confirmed',
  start: { dateTime: `${start}+09:00` },
  end: { dateTime: `${end}+09:00` },
  ...extra,
});

describe('summarizeBusyDays', () => {
  it('날짜별 점유 시간을 분으로 센다', () => {
    const { minutesByDate } = summarizeBusyDays([
      ev('2026-10-05T09:00:00', '2026-10-05T10:30:00'),
      ev('2026-10-05T14:00:00', '2026-10-05T15:00:00'),
    ]);
    expect(minutesByDate).toEqual({ '2026-10-05': 150 });
  });

  it('하루 6시간 이상이면 바쁜 날, 미만이면 아니다', () => {
    const { busyDates } = summarizeBusyDays([
      ev('2026-10-05T09:00:00', '2026-10-05T15:00:00'), // 360분 = 임계값
      ev('2026-10-06T09:00:00', '2026-10-06T14:59:00'), // 359분
    ]);
    expect(BUSY_THRESHOLD_MINUTES).toBe(360);
    expect(busyDates).toEqual(['2026-10-05']);
  });

  it('겹친 일정은 한 번만 센다', () => {
    const { minutesByDate } = summarizeBusyDays([
      ev('2026-10-05T09:00:00', '2026-10-05T12:00:00'),
      ev('2026-10-05T10:00:00', '2026-10-05T13:00:00'),
    ]);
    expect(minutesByDate['2026-10-05']).toBe(240);
  });

  it('자정을 넘기는 일정은 두 날로 나눈다 (로컬 날짜 기준)', () => {
    const { minutesByDate } = summarizeBusyDays([ev('2026-10-05T22:00:00', '2026-10-06T02:00:00')]);
    expect(minutesByDate).toEqual({ '2026-10-05': 120, '2026-10-06': 120 });
  });

  it('다른 시간대 표기도 로컬 날짜로 환산한다', () => {
    // UTC 2026-10-05T16:00 = 서울 2026-10-06 01:00
    const { minutesByDate } = summarizeBusyDays([
      { start: { dateTime: '2026-10-05T16:00:00Z' }, end: { dateTime: '2026-10-05T17:00:00Z' } },
    ]);
    expect(minutesByDate).toEqual({ '2026-10-06': 60 });
  });

  it('취소·한가함·거절한 일정과 종일 일정은 세지 않는다', () => {
    const { minutesByDate } = summarizeBusyDays([
      ev('2026-10-05T09:00:00', '2026-10-05T17:00:00', { status: 'cancelled' }),
      ev('2026-10-05T09:00:00', '2026-10-05T17:00:00', { transparency: 'transparent' }),
      ev('2026-10-05T09:00:00', '2026-10-05T17:00:00', {
        attendees: [{ self: true, responseStatus: 'declined' }],
      }),
      { start: { date: '2026-10-05' }, end: { date: '2026-10-06' } },
    ]);
    expect(minutesByDate).toEqual({});
  });

  it('내가 수락했거나 다른 사람이 거절한 일정은 센다', () => {
    const { minutesByDate } = summarizeBusyDays([
      ev('2026-10-05T09:00:00', '2026-10-05T10:00:00', {
        attendees: [{ self: true, responseStatus: 'accepted' }, { responseStatus: 'declined' }],
      }),
    ]);
    expect(minutesByDate['2026-10-05']).toBe(60);
  });

  it('깨진 입력에도 던지지 않는다', () => {
    expect(summarizeBusyDays(null)).toEqual({ busyDates: [], minutesByDate: {} });
    expect(
      summarizeBusyDays([null, 1, {}, { start: { dateTime: 'x' }, end: { dateTime: 'y' } }]).busyDates
    ).toEqual([]);
    // 끝이 시작보다 빠른 일정
    expect(
      summarizeBusyDays([ev('2026-10-05T10:00:00', '2026-10-05T09:00:00')]).minutesByDate
    ).toEqual({});
  });

  it('임계값을 바꿀 수 있다', () => {
    const events = [ev('2026-10-05T09:00:00', '2026-10-05T11:00:00')];
    expect(summarizeBusyDays(events, { thresholdMinutes: 120 }).busyDates).toEqual(['2026-10-05']);
  });
});

describe('buildDailyPlan — busyDates', () => {
  const base = { examDate: '2026-10-25', today: '2026-10-01' };
  const allDays = (plan) => plan.schedule.flatMap((e) => e.units.map((u) => u.day));

  it('바쁜 날에는 새 Day 를 배정하지 않고 나머지 날에 나눈다', () => {
    const busyDates = ['2026-10-01', '2026-10-02', '2026-10-03'];
    const plan = buildDailyPlan({ ...base, busyDates });
    for (const date of busyDates) {
      const e = plan.schedule.find((x) => x.date === date);
      expect(e.units).toEqual([]);
      expect(e.kind).toBe('review');
      expect(e.busy).toBe(true);
    }
    expect(allDays(plan)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(plan.today.units).toEqual([]); // 오늘이 바쁘면 오늘 몫은 없다
  });

  it('바쁜 날이 없으면 기존 결과와 같다', () => {
    const a = buildDailyPlan(base);
    const b = buildDailyPlan({ ...base, busyDates: [] });
    expect(b.schedule.map((e) => e.units.map((u) => u.day))).toEqual(
      a.schedule.map((e) => e.units.map((u) => u.day))
    );
    expect(b.schedule.every((e) => e.busy === false)).toBe(true);
  });

  it('고정일(시험 전날·당일)이 바빠도 Day13·14 는 그 날짜에 남는다', () => {
    const plan = buildDailyPlan({ ...base, busyDates: ['2026-10-24', '2026-10-25'] });
    expect(plan.schedule.at(-1).units.map((u) => u.day)).toEqual([14]);
    expect(plan.schedule.at(-2).units.map((u) => u.day)).toEqual([13]);
  });

  it('분배할 날이 전부 바쁘면 바쁜 날을 무시해 분량이 사라지지 않는다', () => {
    const plan = buildDailyPlan({ examDate: '2026-10-04', today: '2026-10-01', busyDates: ['2026-10-01', '2026-10-02'] });
    expect(allDays(plan)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(plan.schedule.every((e) => e.busy === false)).toBe(true);
  });

  it('바쁜 날이 늘면 하루 평균 분량이 늘어난다', () => {
    const none = buildDailyPlan(base).progress.perDay;
    const busy = buildDailyPlan({
      ...base,
      busyDates: Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`),
    }).progress.perDay;
    expect(busy).toBeGreaterThan(none);
  });
});
