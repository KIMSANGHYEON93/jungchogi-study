import { describe, it, expect } from 'vitest';
import { LESSONS, lessonByDay, lessonById } from '../src/domain/lessons.js';
import { ROADMAP_DAYS } from '../src/domain/roadmap.js';
import { matchesExpectedOutput } from '../src/domain/grading.js';

describe('레슨 데이터', () => {
  it('1단계 프로토타입: D-24 · D-23 · D-17 이 있다', () => {
    expect(LESSONS.map((l) => l.d)).toEqual([24, 23, 17]);
    expect(lessonByDay(24).title).toContain('연산자');
    expect(lessonByDay('23').title).toContain('제어문');
    expect(lessonByDay(17).track).toBe('SQL');
    expect(lessonByDay(1)).toBeNull();
    expect(lessonById('sql-join-group').d).toBe(17);
  });

  it('id·일차가 유일하고 로드맵 1단계 일차와 맞는다', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    expect(new Set(LESSONS.map((l) => l.d)).size).toBe(LESSONS.length);
    for (const l of LESSONS) {
      const day = ROADMAP_DAYS.find((x) => x.d === l.d);
      expect(day, `D-${l.d}`).toBeTruthy();
      expect(l.d).toBeGreaterThanOrEqual(16);
    }
  });

  it('모든 레슨에 개념·예제·퀴즈가 있고 퀴즈 정답이 자기 정답과 일치한다', () => {
    for (const l of LESSONS) {
      expect(l.goals.length).toBeGreaterThan(0);
      expect(l.sections.length).toBeGreaterThan(0);
      expect(l.pitfalls.length).toBeGreaterThan(0);
      expect(l.questions.length).toBeGreaterThanOrEqual(4);
      expect(new Set(l.questions.map((q) => q.id)).size).toBe(l.questions.length);
      for (const q of l.questions) {
        expect(q.code && q.answer && q.explain, `${l.id}/${q.id}`).toBeTruthy();
        expect(matchesExpectedOutput(q.answer, q.answer)).toBe(true);
      }
    }
  });

  it('SQL 레슨은 샘플 표를 갖고 모든 행이 열 수와 맞는다', () => {
    const t = lessonByDay(17).tables;
    expect(t.map((x) => x.name)).toEqual(['DEPT', 'EMP']);
    for (const table of t) for (const row of table.rows) expect(row).toHaveLength(table.columns.length);
  });
});
