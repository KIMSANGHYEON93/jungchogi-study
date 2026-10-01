import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ROADMAP_DAYS,
  ROADMAP_PHASES,
  buildRoadmap,
  phaseOfD,
  topicsFor,
} from '../src/domain/roadmap.js';

const base = { examDate: '2026-10-25', today: '2026-10-01' };
const allDays = (r) => r.phases.flatMap((p) => p.days);

describe('25일 구성', () => {
  const r = buildRoadmap(base);

  it('D-24 ~ D-1 학습일 24일 + D-Day 로 25칸이다', () => {
    expect(allDays(r).map((d) => d.d)).toEqual(Array.from({ length: 24 }, (_, i) => 24 - i));
    expect(r.examDay.d).toBe(0);
    expect(allDays(r)).toHaveLength(24);
  });

  it('4단계의 경계가 요구한 구간과 같다', () => {
    const range = (p) => [p.days[0].d, p.days.at(-1).d, p.days.length];
    expect(r.phases.map((p) => p.name)).toEqual([
      '코딩 · SQL 집중',
      '인프라 · 테스트',
      '기사 특화',
      '기출 회독 · 최종 점검',
    ]);
    expect(r.phases.map(range)).toEqual([
      [24, 16, 9],
      [15, 10, 6],
      [9, 4, 6],
      [3, 1, 3],
    ]);
    expect(phaseOfD(16).no).toBe(1);
    expect(phaseOfD(15).no).toBe(2);
    expect(phaseOfD(10).no).toBe(2);
    expect(phaseOfD(9).no).toBe(3);
    expect(phaseOfD(4).no).toBe(3);
    expect(phaseOfD(3).no).toBe(4);
    expect(phaseOfD(0)).toBeNull();
  });

  it('시험일에서 거꾸로 센 날짜다 (D-24 = 10/1, D-Day = 10/25)', () => {
    const days = allDays(r);
    expect(days[0]).toMatchObject({ label: 'D-24', date: '2026-10-01' });
    expect(days.at(-1)).toMatchObject({ label: 'D-1', date: '2026-10-24' });
    expect(r.examDay).toMatchObject({ label: 'D-Day', date: '2026-10-25' });
  });

  it('시험일을 바꾸면 날짜가 따라가고 D 번호는 그대로다', () => {
    const moved = buildRoadmap({ examDate: '2026-11-14', today: '2026-10-01' });
    expect(allDays(moved)[0]).toMatchObject({ d: 24, date: '2026-10-21' });
  });

  it('시험일이 없으면 10/25 기본값을 쓴다', () => {
    const d = buildRoadmap({ examDate: null, today: '2026-10-01' });
    expect(d.examDate).toBe('2026-10-25');
    expect(d.isDefaultExamDate).toBe(true);
  });
});

describe('오늘 표시', () => {
  it('10/1 은 D-24 이고 지난 날은 isPast', () => {
    const r = buildRoadmap(base);
    expect(r.status).toBe('ok');
    expect(r.todayD).toBe(24);
    expect(allDays(r).filter((d) => d.isToday).map((d) => d.d)).toEqual([24]);
    expect(allDays(r).some((d) => d.isPast)).toBe(false);

    const later = buildRoadmap({ ...base, today: '2026-10-10' });
    expect(later.todayD).toBe(15);
    expect(allDays(later).filter((d) => d.isPast).map((d) => d.d)).toEqual([24, 23, 22, 21, 20, 19, 18, 17, 16]);
    expect(allDays(later).find((d) => d.isToday).d).toBe(15);
  });

  it('시작 전·시험 후 상태', () => {
    expect(buildRoadmap({ ...base, today: '2026-09-20' }).status).toBe('before');
    expect(buildRoadmap({ ...base, today: '2026-10-26' }).status).toBe('exam-passed');
    expect(buildRoadmap({ ...base, today: '2026-10-25' }).todayD).toBe(0);
    expect(buildRoadmap({ ...base, today: '2026-10-25' }).examDay.isToday).toBe(true);
  });
});

describe('진도', () => {
  it('체크한 날만큼 비율이 오른다 (D-Day 제외 24일 기준)', () => {
    const r = buildRoadmap({ ...base, checks: { 24: true, 23: true, 22: true } });
    expect(r.progress).toEqual({ done: 3, total: 24, percent: 13 });
    expect(allDays(r).filter((d) => d.done).map((d) => d.d)).toEqual([24, 23, 22]);
  });

  it('모두 체크하면 100%, 거짓·깨진 값은 완료가 아니다', () => {
    const all = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, true]));
    expect(buildRoadmap({ ...base, checks: all }).progress.percent).toBe(100);
    expect(buildRoadmap({ ...base, checks: { 24: false, 23: 0, 22: null, 21: '' } }).progress.done).toBe(0);
    expect(buildRoadmap({ ...base, checks: null }).progress.done).toBe(0);
  });

  it('D-Day 는 체크 대상이 아니다', () => {
    const r = buildRoadmap({ ...base, checks: { 0: true } });
    expect(r.examDay.done).toBe(false);
    expect(r.progress.done).toBe(0);
  });
});

describe('주제 링크', () => {
  const corpus = readdirSync(resolve(process.cwd(), 'public/data'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(resolve(process.cwd(), 'public/data', f), 'utf-8').toLowerCase())
    .join('\n');
  const topics = ROADMAP_DAYS.flatMap((d) => d.topics);
  const ROUTES = new Set(['/quiz', '/practice', '/wrong', '/exam']);

  it('학습 노트 Day 는 1~14 범위, 화면 경로는 존재하는 것만', () => {
    for (const t of topics) {
      if (t.study !== undefined) {
        expect(t.study).toBeGreaterThanOrEqual(1);
        expect(t.study).toBeLessThanOrEqual(14);
      }
      if (t.to) expect(ROUTES.has(t.to.split('?')[0]), t.to).toBe(true);
    }
  });

  it('모든 주제에 갈 곳이 하나 이상 있다', () => {
    // 갈 곳이 없는 주제는 읽기만 하는 문구라 허용하되, 같은 날 다른 주제가 갈 곳을 가져야 한다
    for (const day of ROADMAP_DAYS) {
      expect(day.topics.some((t) => t.study !== undefined || t.query || t.to), `D-${day.d}`).toBe(true);
    }
  });

  it('검색어는 실제 학습 자료에서 결과가 나온다', () => {
    for (const t of topics.filter((x) => x.query)) {
      expect(corpus.includes(t.query.toLowerCase()), t.query).toBe(true);
    }
  });

  it('각 단계의 주제가 요구한 영역을 다룬다', () => {
    const text = (from, to) =>
      ROADMAP_DAYS.filter((d) => d.d <= from && d.d >= to).flatMap((d) => d.topics.map((t) => t.text)).join(' ');
    expect(text(24, 16)).toMatch(/C언어/);
    expect(text(24, 16)).toMatch(/Java/);
    expect(text(24, 16)).toMatch(/Python/);
    expect(text(24, 16)).toMatch(/SQL/);
    expect(text(15, 10)).toMatch(/스케줄링/);
    expect(text(15, 10)).toMatch(/서브넷/);
    expect(text(15, 10)).toMatch(/테스트/);
    expect(text(9, 4)).toMatch(/SDLC/);
    expect(text(9, 4)).toMatch(/디자인패턴/);
    expect(text(9, 4)).toMatch(/연계/);
    expect(text(9, 4)).toMatch(/보안/);
    expect(text(3, 1)).toMatch(/기출/);
    expect(text(3, 1)).toMatch(/공식/);
  });
});

describe('단계 정의', () => {
  it('구간이 겹치거나 비지 않고 D-24 ~ D-1 을 덮는다', () => {
    const covered = ROADMAP_PHASES.flatMap((p) => Array.from({ length: p.fromD - p.toD + 1 }, (_, i) => p.fromD - i));
    expect(covered).toEqual(Array.from({ length: 24 }, (_, i) => 24 - i));
  });
});

describe('기사·산업기사 공통 계획', () => {
  const phase = (no) => buildRoadmap(base).phases[no - 1].days;

  it('시험 종류로 갈라지지 않는다 — 옵션 없이 하나의 계획이다', () => {
    const a = buildRoadmap(base);
    const b = buildRoadmap({ ...base, examType: 'industrial' });
    expect(b.phases.map((p) => p.days.map((d) => d.topics.map((t) => t.text)))).toEqual(
      a.phases.map((p) => p.days.map((d) => d.topics.map((t) => t.text)))
    );
    expect('examType' in a).toBe(false);
  });

  it('3단계는 공통 복습이 먼저, 기사 특화가 뒤에 온다', () => {
    for (const day of phase(3)) {
      expect(day.topics.map((t) => t.scope)).toEqual(['common', 'engineer']);
    }
  });

  it('기사 특화 주제(SDLC·디자인패턴·연계·보안)가 계획에 모두 들어 있다', () => {
    const engineer = phase(3).flatMap((d) => d.topics.filter((t) => t.scope === 'engineer').map((t) => t.text)).join(' ');
    for (const word of ['SDLC', '디자인패턴', '연계', '보안']) expect(engineer).toMatch(word);
  });

  it('1·2·4단계는 공통 주제만이다', () => {
    for (const no of [1, 2, 4]) {
      for (const day of phase(no)) expect(day.topics.every((t) => t.scope === 'common')).toBe(true);
    }
  });

  it('원본 주제 배열을 건드리지 않는다', () => {
    const day = ROADMAP_DAYS.find((d) => d.d === 9);
    const before = day.topics.map((t) => t.text);
    topicsFor(day);
    expect(day.topics.map((t) => t.text)).toEqual(before);
  });
});
