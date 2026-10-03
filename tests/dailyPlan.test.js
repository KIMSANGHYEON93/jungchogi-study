import { describe, it, expect } from 'vitest';
import { addDays, daysUntil, defaultExamDate, resolveExamDate } from '../src/domain/dailyPlan.js';

describe('daysUntil / addDays', () => {
  it('오늘 2026-10-01 → 10/25 까지 24일', () => {
    expect(daysUntil('2026-10-25', '2026-10-01')).toBe(24);
  });

  it('시험 당일은 0, 지났으면 음수', () => {
    expect(daysUntil('2026-10-25', '2026-10-25')).toBe(0);
    expect(daysUntil('2026-10-25', '2026-10-27')).toBe(-2);
  });

  it('월·연 경계와 윤년을 넘어도 정확하다', () => {
    expect(daysUntil('2026-11-02', '2026-10-30')).toBe(3);
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysUntil('2028-03-01', '2028-02-28')).toBe(2); // 2028 은 윤년
  });

  it('DST 가 낀 구간도 하루 단위로 센다 (UTC 산술)', () => {
    expect(daysUntil('2026-03-30', '2026-03-28')).toBe(2);
    expect(daysUntil('2026-11-02', '2026-10-31')).toBe(2);
  });

  it('형식·달력이 틀리면 null', () => {
    expect(daysUntil('2026-02-30', '2026-02-01')).toBeNull();
    expect(daysUntil('2026-10-25', 'oops')).toBeNull();
    expect(daysUntil(null, '2026-10-01')).toBeNull();
    expect(daysUntil(20261025, '2026-10-01')).toBeNull();
  });

  it('addDays 는 날짜 키를 돌려주고 잘못된 입력은 null', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('nope', 1)).toBeNull();
  });
});

describe('defaultExamDate / resolveExamDate', () => {
  it('올해 10/25 가 남아 있으면 올해, 지났으면 내년', () => {
    expect(defaultExamDate('2026-10-01')).toBe('2026-10-25');
    expect(defaultExamDate('2026-10-25')).toBe('2026-10-25');
    expect(defaultExamDate('2026-10-26')).toBe('2027-10-25');
    expect(defaultExamDate('bad')).toBeNull();
  });

  it('저장값이 유효하면 그대로, 없거나 깨졌으면 기본값', () => {
    expect(resolveExamDate('2026-11-14', '2026-10-01')).toEqual({
      examDate: '2026-11-14',
      isDefault: false,
    });
    expect(resolveExamDate(null, '2026-10-01')).toEqual({
      examDate: '2026-10-25',
      isDefault: true,
    });
    expect(resolveExamDate('2026-13-45', '2026-10-01').isDefault).toBe(true);
  });
});
