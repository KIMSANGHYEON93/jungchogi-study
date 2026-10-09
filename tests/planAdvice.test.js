import { describe, it, expect } from 'vitest';
import { ROADMAP_DAYS, buildRoadmap } from '../src/domain/roadmap.js';
import {
  adjustmentFor,
  areaOfExamQuestion,
  areaReport,
  areaShift,
  catchUpPlan,
  evaluateGate,
  shiftMinutesForD10,
  summarizeSession,
  traceAccuracy,
} from '../src/domain/planAdvice.js';

const GATE_DAYS = ROADMAP_DAYS.filter((x) => x.gate);
const byD = (d) => ROADMAP_DAYS.find((x) => x.d === d);

/** n 문항 중 correct 개 맞힌 회차 — 영역은 code/sql/theory 를 돌아가며 */
function session(id, verdicts, areas = ['code', 'sql', 'theory']) {
  return { id, startedAt: Number(id.replace(/\D/g, '')) || 1, items: verdicts.map((v, i) => ({ qid: `q${i}`, area: areas[i % areas.length], verdict: v })) };
}
const graded = (correct, total = 20) => Array.from({ length: total }, (_, i) => (i < correct ? 'correct' : 'incorrect'));

describe('모의고사 회차 점수', () => {
  it('직접 채점한 문항만 센다 — 다 채점해야 점수가 확정된다', () => {
    const half = session('s1', [...graded(5, 10), ...Array(10).fill(null)]);
    expect(summarizeSession(half)).toMatchObject({ graded: 10, correct: 5, complete: false, score: 25 });
    expect(summarizeSession(session('s2', graded(12)))).toMatchObject({ complete: true, score: 60 });
  });

  it('문항 영역: 코드 SQL·단답 데이터베이스 → SQL, 나머지 코드 → 코딩, 나머지 단답 → 이론', () => {
    expect(areaOfExamQuestion({ type: 'code', lang: 'c' })).toBe('code');
    expect(areaOfExamQuestion({ type: 'code', lang: 'sql' })).toBe('sql');
    expect(areaOfExamQuestion({ type: 'quiz', category: '데이터베이스' })).toBe('sql');
    expect(areaOfExamQuestion({ type: 'quiz', category: '테스트' })).toBe('theory');
  });
});

describe('점검일 판정', () => {
  it('채점을 끝낸 모의고사가 없으면 판정하지 않고 기본 계획 + 이유', () => {
    const ev = evaluateGate(byD(10), { sessions: [session('s1', [...graded(3, 10), ...Array(10).fill(null)])] });
    expect(ev.band).toBeNull();
    expect(ev.note).toMatch(/채점을 끝낸 모의고사가 아직 없습니다/);
  });

  it('최근 완료 회차 점수로 구간을 정한다 (경계 40 · 50)', () => {
    expect(evaluateGate(byD(10), { sessions: [session('s1', graded(8))] }).band.label).toBe('40~49점');
    expect(evaluateGate(byD(10), { sessions: [session('s1', graded(7))] }).band.label).toBe('40점 미만');
    expect(evaluateGate(byD(10), { sessions: [session('s1', graded(10))] }).band.label).toBe('50점 이상');
  });

  it('D-16 은 직접 채운 추적표만 센다 — 끝까지 본 것(viewed)은 정답률에 넣지 않는다', () => {
    expect(traceAccuracy({ a: 'viewed', b: 'viewed', c: 'done' })).toEqual({ graded: 1, rate: 100, enough: false });
    const five = { a: 'done', b: 'done', c: 'done', d: 'done', e: 'wrong', f: 'viewed' };
    expect(traceAccuracy(five)).toMatchObject({ graded: 5, rate: 80, enough: true });
    expect(evaluateGate(byD(16), { traceProgress: five }).band.label).toBe('85% 미만');
    expect(evaluateGate(byD(16), { traceProgress: { a: 'viewed' } }).band).toBeNull();
  });
});

describe('영역별 배분', () => {
  it('영역마다 3문항 이상 채점해야 진단한다 — 부족하면 기본 배분을 쓰고 그렇다고 알린다', () => {
    const thin = session('s1', graded(10), ['code']); // 전부 코딩 → SQL·이론 진단 없음
    const report = areaReport([thin]);
    expect(report.insufficient).toBe(true);
    expect(report.weakest).toBeNull();
    const shift = areaShift(20, report);
    expect(shift.minutes).toBe(0);
    expect(shift.note).toMatch(/진단이 부족/);
  });

  it('가장 낮은 영역에 구간이 정한 분만큼 돌린다 (총점만 보고 코딩으로 몰지 않는다)', () => {
    // 코딩 다 맞고 SQL 다 틀림
    const items = Array.from({ length: 21 }, (_, i) => ({ qid: `q${i}`, area: ['code', 'sql', 'theory'][i % 3], verdict: i % 3 === 1 ? 'incorrect' : 'correct' }));
    const report = areaReport([{ id: 's', items }]);
    expect(report.weakest).toMatchObject({ key: 'sql', rate: 0 });
    expect(areaShift(20, report)).toMatchObject({ minutes: 20, area: { key: 'sql' } });
  });

  it('D-10 구간 → 돌릴 분: 50+ 0분 · 40~49 20분 · 40 미만 40분', () => {
    const bands = byD(10).gate.bands;
    expect(bands.map(shiftMinutesForD10)).toEqual([0, 20, 40]);
    expect(shiftMinutesForD10(null)).toBe(0);
  });

  it('3단계 일차의 조정 안내는 D-10 결과를 따른다', () => {
    const adj = adjustmentFor(byD(8), { sessions: [], gateDays: GATE_DAYS });
    expect(adj.text).toMatch(/판정 전/);
    expect(adjustmentFor(byD(20), { gateDays: GATE_DAYS })).toBeNull();
  });
});

describe('밀린 일정 복구', () => {
  const checksUpTo = (fromD, toD) => Object.fromEntries(Array.from({ length: fromD - toD + 1 }, (_, i) => [fromD - i, true]));

  it('밀린 날이 없거나 시험이 지났으면 계획을 내지 않는다', () => {
    expect(catchUpPlan(buildRoadmap({ examDate: '2026-10-25', today: '2026-10-01' }))).toBeNull();
    expect(catchUpPlan(buildRoadmap({ examDate: '2026-10-25', today: '2026-10-30' }))).toBeNull();
  });

  it('시험일 미설정이면 기본 시험일로 계산한다 (계획은 그대로 나온다)', () => {
    const r = buildRoadmap({ examDate: null, today: '2026-10-04' });
    expect(r.isDefaultExamDate).toBe(true);
    expect(catchUpPlan(r).lateStudy).toEqual([24, 23, 22]);
  });

  it('여유가 있으면 밀린 주제 블록 40분을 남은 학습일의 코드 블록 20분씩으로 나눠 배치한다', () => {
    const r = buildRoadmap({ examDate: '2026-10-25', today: '2026-10-04', checks: { 24: true } }); // D-21, D-23·D-22 밀림
    const plan = catchUpPlan(r);
    expect(plan.lateStudy).toEqual([23, 22]);
    expect(plan.needed).toBe(80);
    expect(plan.feasible).toBe(true);
    expect(plan.assignments.map((a) => a.parts.map((p) => p.minutes))).toEqual([[20, 20], [20, 20]]);
    // 4단계·실전일에는 배치하지 않는다
    const used = plan.assignments.flatMap((a) => a.parts.map((p) => p.label));
    expect(used.every((l) => Number(l.slice(2)) > 3)).toBe(true);
    expect(used).not.toContain('D-16');
    expect(r.phases.flatMap((p) => p.days).find((x) => x.d === 23).date).toBe('2026-10-02'); // 원래 날짜는 그대로
  });

  it('남은 날이 부족하면 필수만 배치하고 나머지는 선택 학습으로, 필요한 추가 시간을 알린다', () => {
    // D-5 시점, D-24~D-6 중 학습일 대부분을 안 함
    const r = buildRoadmap({ examDate: '2026-10-25', today: '2026-10-20', checks: {} });
    const plan = catchUpPlan(r);
    expect(plan.feasible).toBe(false);
    expect(plan.optional.length).toBeGreaterThan(0);
    expect(plan.capacity).toBe(plan.slotCount * 20);
    expect(plan.extraPerDayNeeded).toBeGreaterThan(0);
    expect(plan.latePractice).toEqual([10]);
  });

  it('남은 학습일이 하나도 없으면(4단계) 모두 선택 학습이다', () => {
    const r = buildRoadmap({ examDate: '2026-10-25', today: '2026-10-23', checks: checksUpTo(24, 4) }); // D-2, D-3 밀림
    const plan = catchUpPlan(r);
    expect(plan.lateStudy).toEqual([]);
    expect(plan.latePractice).toEqual([3]);
    expect(plan.slotCount).toBe(0);
  });
});
