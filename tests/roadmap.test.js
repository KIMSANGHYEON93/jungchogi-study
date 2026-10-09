import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DAILY_BLOCKS,
  DAILY_MINUTES,
  dayBlocks,
  dayLoad,
  gateBand,
  ROADMAP_DAYS,
  ROADMAP_PHASES,
  buildRoadmap,
  daysForStudyDoc,
  phaseOfD,
  roadmapSchedule,
  topicsFor,
  upcomingDays,
} from '../src/domain/roadmap.js';
import { EXAM_SPEC, MOCK_EXAM } from '../src/domain/studyTime.js';

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
      '실전 모의고사 · 최종 점검',
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
    expect(text(3, 1)).toMatch(/모의고사/);
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

describe('오늘 일차(today) · 밀린 일차(late)', () => {
  it('오늘 일차를 돌려준다 (D-24 ~ D-Day)', () => {
    expect(buildRoadmap(base).today).toMatchObject({ d: 24, label: 'D-24', title: 'C언어 연산자' });
    expect(buildRoadmap({ ...base, today: '2026-10-25' }).today).toMatchObject({ d: 0, label: 'D-Day' });
  });

  it('시작 전·시험 후·시험일 없음에는 오늘 일차가 없다', () => {
    expect(buildRoadmap({ ...base, today: '2026-09-20' }).today).toBeNull();
    expect(buildRoadmap({ ...base, today: '2026-10-26' }).today).toBeNull();
  });

  it('지났는데 끝내지 못한 일차가 late 이고, 큰 D 번호(오래된 날)부터다', () => {
    const r = buildRoadmap({ ...base, today: '2026-10-04', checks: { 24: true } }); // D-21
    expect(r.late).toEqual([23, 22]);
    expect(buildRoadmap(base).late).toEqual([]);
    expect(buildRoadmap({ ...base, today: '2026-09-20' }).late).toEqual([]);
  });

  it('오늘 일차는 아직 밀린 것이 아니다', () => {
    const r = buildRoadmap({ ...base, today: '2026-10-04' });
    expect(r.late).not.toContain(21);
  });
});

describe('일정이 많은 날(busyDates)', () => {
  it('날짜에 맞는 일차에 busy 를 표시하고 일차 자체는 옮기지 않는다', () => {
    const plain = buildRoadmap(base);
    const r = buildRoadmap({ ...base, busyDates: ['2026-10-01', '2026-10-03', '2026-10-25'] });
    expect(allDays(r).filter((d) => d.busy).map((d) => d.d)).toEqual([24, 22]);
    expect(allDays(r).map((d) => [d.d, d.date, d.title])).toEqual(allDays(plain).map((d) => [d.d, d.date, d.title]));
    expect(r.examDay.busy).toBe(false); // 시험 당일은 표시하지 않는다
    expect(allDays(plain).every((d) => d.busy === false)).toBe(true);
  });

  it('깨진 날짜는 무시한다', () => {
    expect(allDays(buildRoadmap({ ...base, busyDates: ['x', '', '2026-13-45'] })).some((d) => d.busy)).toBe(false);
  });
});

describe('upcomingDays', () => {
  it('오늘 다음 일차부터 최대 count 개, D-Day 도 포함한다', () => {
    expect(upcomingDays(buildRoadmap(base), 3).map((d) => d.d)).toEqual([23, 22, 21]);
    expect(upcomingDays(buildRoadmap({ ...base, today: '2026-10-22' }), 6).map((d) => d.d)).toEqual([2, 1, 0]);
  });

  it('시작 전이면 첫 일차부터, 시험 당일·시험 후면 비어 있다', () => {
    expect(upcomingDays(buildRoadmap({ ...base, today: '2026-09-20' }), 2).map((d) => d.d)).toEqual([24, 23]);
    expect(upcomingDays(buildRoadmap({ ...base, today: '2026-10-25' }), 6)).toEqual([]);
    expect(upcomingDays(buildRoadmap({ ...base, today: '2026-10-26' }), 6)).toEqual([]);
    expect(upcomingDays(buildRoadmap(base), 0)).toEqual([]);
  });
});

describe('roadmapSchedule (캘린더 내보내기용)', () => {
  it('오늘부터의 학습일 24일 + 시험 당일 = 25개, 날짜순이다', () => {
    const s = roadmapSchedule(buildRoadmap(base));
    expect(s).toHaveLength(25);
    expect(s.map((e) => e.date)).toEqual([...s.map((e) => e.date)].sort());
    expect(s[0]).toMatchObject({ date: '2026-10-01', dDay: 24, kind: 'study', title: 'D-24 C언어 연산자', busy: false });
    expect(s.at(-1)).toMatchObject({ date: '2026-10-25', dDay: 0, kind: 'exam' });
    expect(s.at(-1).title).toBeUndefined();
  });

  it('완료한 일차와 지난 일차는 빠지고 시험 당일은 항상 남는다', () => {
    const s = roadmapSchedule(buildRoadmap({ ...base, today: '2026-10-04', checks: { 21: true, 20: true } }));
    expect(s.map((e) => e.dDay)).toEqual([19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it('시작 전이면 전체를 내보내고, 시험 후·날짜 없음이면 비어 있다', () => {
    expect(roadmapSchedule(buildRoadmap({ ...base, today: '2026-09-20' }))).toHaveLength(25);
    expect(roadmapSchedule(buildRoadmap({ ...base, today: '2026-10-26' }))).toEqual([]);
  });

  it('학습 항목은 단계 이름과 함께 units 로 담긴다', () => {
    const [first] = roadmapSchedule(buildRoadmap(base));
    expect(first.units).toEqual([
      { label: 'C언어 — 산술 · 증감 · 비트 · 논리 연산자', phase: { label: '코딩 · SQL 집중' } },
    ]);
  });

  it('busy 를 그대로 전한다', () => {
    const s = roadmapSchedule(buildRoadmap({ ...base, busyDates: ['2026-10-02'] }));
    expect(s.filter((e) => e.busy).map((e) => e.dDay)).toEqual([23]);
  });
});

describe('daysForStudyDoc', () => {
  const r = buildRoadmap(base);

  it('학습 노트 Day 1 을 다루는 일차를 일정 순으로 돌려준다', () => {
    expect(daysForStudyDoc(r, 1).map((d) => d.d)).toEqual([24, 23, 22]);
  });

  it('로드맵에 없는 Day 는 빈 배열이다', () => {
    expect(daysForStudyDoc(r, 7)).toEqual([]);
    expect(daysForStudyDoc(r, 99)).toEqual([]);
  });

  it('완료 여부가 일차에 실린다', () => {
    const done = buildRoadmap({ ...base, checks: { 24: true } });
    expect(daysForStudyDoc(done, 1).map((d) => d.done)).toEqual([true, false, false]);
  });
});

describe('하루 2시간 배분 · 기출 실전일 · 점검 기준', () => {
  const days = buildRoadmap(base).phases.flatMap((p) => p.days);
  const byD = (d) => days.find((x) => x.d === d);

  it('고정 블록은 코드 → 주제 → 복습 순이고 합이 2시간이다', () => {
    expect(DAILY_BLOCKS.map((b) => b.key)).toEqual(['code', 'topic', 'review']);
    expect(DAILY_BLOCKS.reduce((sum, b) => sum + b.minutes, 0)).toBe(DAILY_MINUTES);
    expect(DAILY_BLOCKS[0].minutes).toBeGreaterThanOrEqual(60);
  });

  it('보통 학습일은 고정 블록, 실전 모의고사일은 실제 시험 시간 풀이 + 채점·오답 정리, 시험 당일은 없음', () => {
    expect(dayBlocks(byD(22))).toBe(DAILY_BLOCKS);
    expect(DAILY_BLOCKS.reduce((s, b) => s + b.minutes, 0)).toBe(DAILY_MINUTES);
    const practice = dayBlocks(byD(10));
    expect(practice.map((b) => [b.key, b.minutes])).toEqual([['exam', EXAM_SPEC.minutes], ['grade', 30]]);
    expect(practice[0].to).toBe('/exam');
    expect(dayBlocks(buildRoadmap(base).examDay)).toEqual([]);
  });

  it('하루 가용 시간을 넘는 날은 초과분과 넘길 수 있는 몫을 계산한다', () => {
    expect(dayLoad(byD(22))).toEqual({ planned: 120, available: 120, overflow: 0, carryKey: null, carryMinutes: 0 });
    expect(dayLoad(byD(10))).toEqual({ planned: 180, available: 120, overflow: 60, carryKey: 'grade', carryMinutes: 30 });
    expect(dayLoad(byD(10), 200).overflow).toBe(0);
  });

  it('로드맵의 모의고사 시간은 모의고사 화면과 같은 공통 값(실전 150분)이다', () => {
    expect(MOCK_EXAM.minutes).toBe(EXAM_SPEC.minutes);
    expect(EXAM_SPEC.minutes).toBe(150);
    for (const d of [10, 4, 3, 2]) expect(dayBlocks(byD(d))[0].minutes).toBe(MOCK_EXAM.minutes);
  });

  it('복원 기출이라고 표시하지 않는다 (이 앱의 모의고사는 자체 제작)', () => {
    const all = JSON.stringify(ROADMAP_DAYS) + JSON.stringify(ROADMAP_PHASES);
    expect(all).not.toMatch(/복원 기출|기출 \d회분|기출 [①②③④]/);
  });

  it('기출 실전일은 D-10 · D-4 · D-3 · D-2 — 2·3단계 점검일과 4단계', () => {
    expect(days.filter((x) => x.kind === 'practice').map((x) => x.d)).toEqual([10, 4, 3, 2]);
    for (const d of [10, 4, 3, 2]) expect(byD(d).topics.some((t) => t.to === '/exam')).toBe(true);
    expect(byD(22).kind).toBe('study');
    expect(buildRoadmap(base).examDay.kind).toBe('exam');
  });

  it('점검일마다 점수 구간이 0~100 을 빈틈없이 덮는다 — D-16 코드 진단은 85%', () => {
    expect(days.filter((x) => x.gate).map((x) => x.d)).toEqual([16, 10, 4]);
    expect(byD(16).gate.bands[0]).toMatchObject({ min: 85 });
    expect(byD(16).gate.bands[1].action).toMatch(/코드 80분/);
    for (const d of [16, 10, 4]) {
      const { bands } = byD(d).gate;
      expect(bands.at(-1).min).toBe(0);
      for (let i = 1; i < bands.length; i++) expect(bands[i].min).toBeLessThan(bands[i - 1].min);
      for (let v = 0; v <= 100; v++) expect(gateBand(byD(d).gate, v)).not.toBeNull();
    }
    expect(byD(22).gate).toBeNull();
  });

  it('경계값 39·40·49·50·59·60 에서 D-10 · D-4 구간이 하나로 정해진다', () => {
    const d10 = (v) => gateBand(byD(10).gate, v).label;
    expect([39, 40, 49, 50, 59, 60].map(d10)).toEqual(['40점 미만', '40~49점', '40~49점', '50점 이상', '50점 이상', '50점 이상']);
    const d4 = (v) => gateBand(byD(4).gate, v).label;
    expect([39, 40, 49, 50, 59, 60].map(d4)).toEqual(['60점 미만', '60점 미만', '60점 미만', '60점 미만', '60점 미만', '60점 이상']);
  });

  it('4단계 원칙(새 단원 금지)과 D-4 구간 지침이 충돌하지 않는다', () => {
    expect(ROADMAP_PHASES[3].focus).toMatch(/새 단원은 시작하지 않는다/);
    for (const b of byD(4).gate.bands) expect(b.action).toMatch(/새 단원은 시작하지 않음/);
    expect(JSON.stringify(byD(4).gate)).not.toMatch(/이론 범위를 넓혀도/);
  });
});
