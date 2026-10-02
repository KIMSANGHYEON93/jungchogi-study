import { describe, it, expect } from 'vitest';
import { LESSONS, lessonByDay, lessonById } from '../src/domain/lessons.js';
import { ROADMAP_DAYS } from '../src/domain/roadmap.js';
import { matchesExpectedOutput } from '../src/domain/grading.js';

describe('레슨 데이터', () => {
  it('1단계 D-24 ~ D-17 의 8개 일차가 일차 내림차순으로 있다 (D-16 은 점검일)', () => {
    expect(LESSONS.map((l) => l.d)).toEqual([24, 23, 22, 21, 20, 19, 18, 17]);
    expect(LESSONS.map((l) => l.track)).toEqual(['C', 'C', 'C', 'Java', 'Java', 'Python', 'SQL', 'SQL']);
    expect(lessonByDay(16)).toBeNull();
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
    expect(lessonByDay(17).tables.map((x) => x.name)).toEqual(['DEPT', 'EMP']);
    expect(lessonByDay(18).tables.map((x) => x.name)).toEqual(['STUDENT']);
    for (const l of LESSONS.filter((x) => x.tables)) {
      for (const table of l.tables) for (const row of table.rows) expect(row).toHaveLength(table.columns.length);
    }
  });

  it('예제 코드의 개행·역슬래시가 보존되고 앞뒤 공백은 없다', () => {
    const c = lessonByDay(22).sections[0].code;
    expect(c.startsWith('#include')).toBe(true);
    expect(c.endsWith('}')).toBe(true);
    expect(c).toContain('printf("%d %d\\n", a, *p);');
    for (const l of LESSONS) {
      for (const s of l.sections) if (s.code) expect(s.code, `${l.id}/${s.heading}`).toBe(s.code.trim());
      for (const q of l.questions) expect(q.code, `${l.id}/${q.id}`).toBe(q.code.trim());
    }
  });
});
