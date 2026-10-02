import { describe, it, expect } from 'vitest';
import { summarizeBusyDays, BUSY_THRESHOLD_MINUTES } from '../src/domain/calendarBusy.js';

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
