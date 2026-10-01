import { describe, it, expect } from 'vitest';
import {
  addDays,
  buildDailyPlan,
  daysUntil,
  defaultExamDate,
  phaseOf,
  resolveExamDate,
  splitEvenly,
} from '../src/domain/dailyPlan.js';

const days = (entry) => entry.units.map((u) => u.day);
const allDays = (plan) => plan.schedule.flatMap(days);

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

describe('splitEvenly', () => {
  it('몫의 차이는 최대 1 이고 순서·총합이 보존된다', () => {
    const units = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (let k = 1; k <= 30; k++) {
      const parts = splitEvenly(units, k);
      const sizes = parts.map((p) => p.length);
      expect(parts).toHaveLength(k);
      expect(parts.flat()).toEqual(units);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });
});

describe('phaseOf', () => {
  it('Day 구간별 단계', () => {
    expect(phaseOf(1).key).toBe('learn');
    expect(phaseOf(8).key).toBe('learn');
    expect(phaseOf(9).key).toBe('practice');
    expect(phaseOf(12).key).toBe('practice');
    expect(phaseOf(13).key).toBe('final');
    expect(phaseOf(14).key).toBe('final');
  });
});

describe('buildDailyPlan — 오늘 2026-10-01, 시험 10/25', () => {
  const plan = buildDailyPlan({ examDate: null, today: '2026-10-01' });

  it('저장된 시험일이 없으면 10/25 기본값을 쓴다', () => {
    expect(plan.status).toBe('ok');
    expect(plan.examDate).toBe('2026-10-25');
    expect(plan.isDefaultExamDate).toBe(true);
    expect(plan.daysLeft).toBe(24);
    expect(plan.schedule).toHaveLength(25); // 오늘 ~ 시험 당일
  });

  it('Day13 은 시험 전날, Day14 는 시험 당일에 고정된다', () => {
    const last = plan.schedule.at(-1);
    const eve = plan.schedule.at(-2);
    expect(last.date).toBe('2026-10-25');
    expect(last.kind).toBe('exam');
    expect(days(last)).toEqual([14]);
    expect(eve.date).toBe('2026-10-24');
    expect(days(eve)).toEqual([13]);
  });

  it('Day01~12 가 순서대로 빠짐없이 한 번씩 배정된다', () => {
    expect(allDays(plan)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it('단위가 없는 날은 복습일, 그 외는 학습일', () => {
    const middle = plan.schedule.slice(0, -2);
    expect(middle).toHaveLength(23);
    for (const e of middle) expect(e.kind).toBe(e.units.length ? 'study' : 'review');
    expect(middle.some((e) => e.kind === 'review')).toBe(true);
    expect(plan.today.date).toBe('2026-10-01');
    expect(plan.today.dDay).toBe(24);
  });

  it('하루 몫은 0 또는 1 단위 (12 단위 / 23일)', () => {
    for (const e of plan.schedule.slice(0, -2)) expect(e.units.length).toBeLessThanOrEqual(1);
  });

  it('접속 첫날(오늘)부터 목표 Day 가 배정된다 — 복습일로 시작하지 않는다', () => {
    expect(plan.today.kind).toBe('study');
    expect(days(plan.today)).toEqual([1]);
  });

  it('Day01~12 가 남아 있는 한 오늘 몫은 어떤 기간에서도 비지 않는다', () => {
    for (let left = 2; left <= 40; left++) {
      const p = buildDailyPlan({ examDate: addDays('2026-10-01', left), today: '2026-10-01' });
      expect(p.today.units.length).toBeGreaterThan(0);
    }
  });
});

describe('buildDailyPlan — 완료 체크 반영', () => {
  it('완료한 Day 는 빠지고 남은 분량이 남은 날에 재분배된다', () => {
    const dayChecks = { 1: true, 2: true, 3: true };
    const plan = buildDailyPlan({ examDate: '2026-10-25', today: '2026-10-01', dayChecks });
    expect(allDays(plan)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(plan.progress).toMatchObject({ done: 3, total: 14, remaining: 11 });
  });

  it('체크 값이 거짓이면 완료로 보지 않는다', () => {
    const plan = buildDailyPlan({
      examDate: '2026-10-25',
      today: '2026-10-01',
      dayChecks: { 1: false, 2: 0, 3: null },
    });
    expect(plan.progress.done).toBe(0);
  });

  it('모두 완료하면 all-done', () => {
    const dayChecks = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [i + 1, true]));
    const plan = buildDailyPlan({ examDate: '2026-10-25', today: '2026-10-01', dayChecks });
    expect(plan.status).toBe('all-done');
    expect(allDays(plan)).toEqual([]);
  });
});

describe('buildDailyPlan — 짧은 기간·경계', () => {
  it('날이 부족하면 하루에 여러 단위를 몬다 (균등, 최대 차이 1)', () => {
    const plan = buildDailyPlan({ examDate: '2026-10-08', today: '2026-10-01' }); // 7일 남음
    expect(plan.schedule).toHaveLength(8);
    const free = plan.schedule.slice(0, -2).map((e) => e.units.length);
    expect(free.reduce((a, b) => a + b, 0)).toBe(12);
    expect(Math.max(...free) - Math.min(...free)).toBeLessThanOrEqual(1);
    expect(allDays(plan)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it('시험 전날(daysLeft 1): Day01~12 는 오늘, Day14 는 내일', () => {
    const plan = buildDailyPlan({ examDate: '2026-10-02', today: '2026-10-01' });
    expect(plan.schedule).toHaveLength(2);
    expect(allDays(plan)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(days(plan.schedule[1])).toEqual([14]);
  });

  it('시험 당일(daysLeft 0): 남은 단위가 하나도 사라지지 않는다', () => {
    const plan = buildDailyPlan({ examDate: '2026-10-01', today: '2026-10-01' });
    expect(plan.schedule).toHaveLength(1);
    expect(plan.today.kind).toBe('exam');
    expect(allDays(plan)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14]);
  });

  it('시험일이 지났으면 exam-passed (일정 없음)', () => {
    const plan = buildDailyPlan({ examDate: '2026-09-20', today: '2026-10-01' });
    expect(plan.status).toBe('exam-passed');
    expect(plan.daysLeft).toBe(-11);
    expect(plan.schedule).toEqual([]);
    expect(plan.today).toBeNull();
  });

  it('오늘 날짜가 깨졌으면 no-date', () => {
    const plan = buildDailyPlan({ examDate: null, today: 'garbage' });
    expect(plan.status).toBe('no-date');
    expect(plan.today).toBeNull();
  });

  it('연말을 넘기는 일정의 날짜가 이어진다', () => {
    const plan = buildDailyPlan({ examDate: '2027-01-03', today: '2026-12-30' });
    expect(plan.schedule.map((e) => e.date)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });
});
