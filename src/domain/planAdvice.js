// 진단 데이터 → 다음 학습 계획.
//
// 점검일 점수 구간(roadmap.gateBand), 영역별 성취도, 밀린 일정 복구를 계산한다. 화면은 결과만 보여 준다.
//
// 원칙
//  - 점수는 **직접 채점한 결과**에서만 센다. 문서를 읽거나 추적표를 끝까지 넘겨 본 것은 정답률에 넣지 않는다.
//  - 진단 데이터가 모자라면 그렇다고 표시하고 기본 배분을 쓴다(빈칸을 임의 가중치로 채우지 않는다).
//  - 영역 간 시간 조정은 이 앱의 운영 규칙이다. 공식 출제 비중을 근거로 한 것이 아니다.
//  - 밀린 일정 재배치는 제안일 뿐이다. 원래 일차의 날짜·완료 기록(`roadmap_checks`)은 바꾸지 않는다.

import { DAILY_BLOCKS, MOCK_EXAM, TOPIC_MINUTES } from './studyTime';
import { gateBand } from './roadmap';

export const AREAS = Object.freeze([
  { key: 'code', label: '코딩' },
  { key: 'sql', label: 'SQL' },
  { key: 'theory', label: '이론' },
]);
export const AREA_LABEL = Object.fromEntries(AREAS.map((a) => [a.key, a.label]));

/** 영역 판정에 필요한 최소 채점 문항 수 — 이보다 적으면 "진단 부족"으로 본다 */
export const MIN_GRADED_PER_AREA = 3;

/**
 * 모의고사 문항의 영역. 코드 드릴 SQL 문제와 단답형 '데이터베이스' 영역은 SQL, 나머지 코드는 코딩, 나머지 단답형은 이론.
 * @param {{type: 'quiz'|'code', lang?: string, category?: string}} q
 */
export function areaOfExamQuestion(q) {
  if (q.type === 'code') return q.lang === 'sql' ? 'sql' : 'code';
  return q.category === '데이터베이스' ? 'sql' : 'theory';
}

/**
 * 한 회차의 채점 요약. 다 채점해야 점수(complete)로 쓴다.
 * @param {{items: {area: string, verdict: string|null}[]}} session
 */
export function summarizeSession(session) {
  const items = session?.items ?? [];
  const graded = items.filter((i) => i.verdict === 'correct' || i.verdict === 'incorrect');
  const correct = graded.filter((i) => i.verdict === 'correct').length;
  const byArea = Object.fromEntries(AREAS.map((a) => [a.key, { correct: 0, graded: 0, total: 0 }]));
  for (const i of items) {
    const slot = byArea[i.area] ?? (byArea[i.area] = { correct: 0, graded: 0, total: 0 });
    slot.total += 1;
    if (i.verdict === 'correct' || i.verdict === 'incorrect') slot.graded += 1;
    if (i.verdict === 'correct') slot.correct += 1;
  }
  return {
    total: items.length,
    graded: graded.length,
    correct,
    complete: items.length > 0 && graded.length === items.length,
    score: correct * MOCK_EXAM.pointsEach,
    byArea,
  };
}

/** 채점을 끝낸 가장 최근 회차(없으면 null) */
export function latestCompleteSession(sessions) {
  const done = (sessions ?? []).filter((s) => summarizeSession(s).complete);
  return done.length > 0 ? done[done.length - 1] : null;
}

/**
 * 영역별 성취도. 채점을 끝낸 최근 회차들(최대 `window` 개)을 합쳐 본다.
 * @returns {{areas: {key: string, label: string, correct: number, graded: number, rate: number|null, enough: boolean}[],
 *            weakest: {key: string, label: string, rate: number}|null, insufficient: boolean, sessionsUsed: number}}
 */
export function areaReport(sessions, window = 3) {
  const done = (sessions ?? []).filter((s) => summarizeSession(s).complete).slice(-window);
  const sum = Object.fromEntries(AREAS.map((a) => [a.key, { correct: 0, graded: 0 }]));
  for (const s of done) {
    const { byArea } = summarizeSession(s);
    for (const a of AREAS) {
      sum[a.key].correct += byArea[a.key]?.correct ?? 0;
      sum[a.key].graded += byArea[a.key]?.graded ?? 0;
    }
  }
  const areas = AREAS.map((a) => {
    const { correct, graded } = sum[a.key];
    return { ...a, correct, graded, rate: graded > 0 ? Math.round((correct / graded) * 100) : null, enough: graded >= MIN_GRADED_PER_AREA };
  });
  const ranked = areas.filter((a) => a.enough).sort((x, y) => x.rate - y.rate);
  const insufficient = areas.some((a) => !a.enough);
  return {
    areas,
    weakest: ranked.length > 0 && !insufficient ? { key: ranked[0].key, label: ranked[0].label, rate: ranked[0].rate } : null,
    insufficient,
    sessionsUsed: done.length,
  };
}

/**
 * 변수 추적표 정답률 — **직접 채워 채점한** 문항만 센다('done' 정답, 'wrong' 오답).
 * 끝까지 넘겨 보기만 한 문항('viewed')은 제외한다.
 * @param {Record<string, string>} traceProgress practice_done.trace
 */
export function traceAccuracy(traceProgress, minGraded = 5) {
  const values = Object.values(traceProgress ?? {});
  const right = values.filter((v) => v === 'done').length;
  const graded = right + values.filter((v) => v === 'wrong').length;
  return { graded, rate: graded > 0 ? Math.round((right / graded) * 100) : null, enough: graded >= minGraded };
}

/**
 * 점검일 하나의 판정: 측정값이 있으면 들어간 구간, 없으면 기본 계획(첫 구간 = 계획대로)과 "진단 부족" 표시.
 * @param {{d: number, gate: object}} day
 * @param {{sessions?: object[], traceProgress?: Record<string,string>}} data
 */
export function evaluateGate(day, { sessions = [], traceProgress = {} } = {}) {
  if (!day?.gate) return null;
  if (day.d === 16) {
    const t = traceAccuracy(traceProgress);
    if (!t.enough) return { measured: null, band: null, note: `직접 채워 채점한 추적표가 ${t.graded}문항뿐이라 판정하지 않습니다(5문항 이상 필요). 기본 계획대로 진행하세요.` };
    return { measured: t.rate, band: gateBand(day.gate, t.rate), note: `직접 채점한 추적표 ${t.graded}문항 기준` };
  }
  const latest = latestCompleteSession(sessions);
  if (!latest) return { measured: null, band: null, note: '채점을 끝낸 모의고사가 아직 없습니다. 모의고사를 풀고 20문항을 모두 직접 채점하면 구간이 정해집니다.' };
  const { score } = summarizeSession(latest);
  return { measured: score, band: gateBand(day.gate, score), note: '가장 최근에 채점을 끝낸 모의고사 기준' };
}

/**
 * 주제 블록에서 약한 영역으로 돌릴 시간. 점수 구간이 정한 분(0 · 20 · 40)을 가장 낮은 영역에 쓴다.
 * 영역 진단이 모자라면 시간을 돌리지 않고(기본 배분) 그 사실을 알린다.
 * @param {number} shiftMinutes
 * @param {ReturnType<typeof areaReport>} report
 */
export function areaShift(shiftMinutes, report) {
  if (shiftMinutes <= 0) return { minutes: 0, area: null, note: '기본 배분 그대로' };
  if (!report.weakest) {
    return {
      minutes: 0,
      area: null,
      note: `영역별 진단이 부족합니다(영역마다 직접 채점 ${MIN_GRADED_PER_AREA}문항 이상 필요). 기본 배분(${DAILY_BLOCKS.map((b) => `${b.label} ${b.minutes}분`).join(' · ')})을 씁니다.`,
    };
  }
  return { minutes: shiftMinutes, area: report.weakest, note: `주제 블록 ${TOPIC_MINUTES}분 중 ${shiftMinutes}분을 ${report.weakest.label}(정답률 ${report.weakest.rate}%) 보충으로` };
}

/** D-10 구간 → 주제 블록에서 돌릴 분 */
export function shiftMinutesForD10(band) {
  if (!band) return 0;
  if (band.min >= 50) return 0;
  return band.min >= 40 ? 20 : TOPIC_MINUTES;
}

/**
 * 밀린 일차 복구 제안.
 *
 * 밀린 보통 학습일의 **필수 몫은 주제 블록(40분)** 이다 — 코드·복습 블록은 매일 도니 그날이 지나면 따라잡을 필요가 없다.
 * 밀린 실전 모의고사일은 다시 하지 않고 다음 실전일에 맡긴다(시험을 두 번 몰아 풀면 채점·복습이 밀린다).
 * 보충은 남은 보통 학습일의 코드 블록에서 하루 `perDay`분(기본 20분)을 빌려 하루 120분을 넘기지 않는다.
 * 4단계(D-3 이하)는 새 단원을 시작하지 않으므로 보충 대상 날짜에서 뺀다.
 *
 * @param {ReturnType<import('./roadmap').buildRoadmap>} roadmap
 * @param {{perDay?: number}} [opts]
 */
export function catchUpPlan(roadmap, { perDay = 20 } = {}) {
  if (!roadmap || roadmap.status !== 'ok' || roadmap.late.length === 0) return null;
  const all = roadmap.phases.flatMap((p) => p.days);
  const lateDays = all.filter((x) => roadmap.late.includes(x.d));
  const lateStudy = lateDays.filter((x) => x.kind !== 'practice');
  const latePractice = lateDays.filter((x) => x.kind === 'practice');
  const needed = lateStudy.length * TOPIC_MINUTES;

  // 오늘 이후(오늘 포함)의 보통 학습일 중 아직 안 끝낸 날, 4단계 제외
  const slots = all.filter((x) => x.d <= roadmap.todayD && x.d > 3 && x.kind !== 'practice' && !x.done);
  const capacity = slots.length * perDay;

  // 공통 범위 → 기사 특화, 오래된 일차 → 최근 일차 순으로 우선한다
  const rank = (x) => (x.topics.some((t) => t.scope === 'common') && !x.topics.some((t) => t.scope === 'engineer') ? 0 : 1);
  const ordered = [...lateStudy].sort((a, b) => rank(a) - rank(b) || b.d - a.d);
  const perSlot = perDay;
  const assignments = [];
  let used = 0;
  let slotIdx = 0;
  let remainingInSlot = slots.length > 0 ? perSlot : 0;
  for (const day of ordered) {
    let need = TOPIC_MINUTES;
    const parts = [];
    while (need > 0 && slotIdx < slots.length) {
      const take = Math.min(need, remainingInSlot);
      parts.push({ date: slots[slotIdx].date, label: slots[slotIdx].label, minutes: take });
      need -= take;
      remainingInSlot -= take;
      if (remainingInSlot === 0) {
        slotIdx += 1;
        remainingInSlot = perSlot;
      }
    }
    if (need === 0) {
      assignments.push({ d: day.d, label: day.label, title: day.title, parts });
      used += TOPIC_MINUTES;
    } else {
      break;
    }
  }
  const fitted = new Set(assignments.map((a) => a.d));
  const optional = ordered.filter((x) => !fitted.has(x.d));
  const shortfall = Math.max(0, needed - capacity);
  return {
    lateStudy: lateStudy.map((x) => x.d),
    latePractice: latePractice.map((x) => x.d),
    needed,
    capacity,
    perDay,
    slotCount: slots.length,
    feasible: optional.length === 0,
    assignments,
    // 남는 몫은 필수에서 빼 "선택 학습"으로 — 레슨 확인 퀴즈(약 15분)만 풀고 넘어가기를 권한다
    optional: optional.map((x) => ({ d: x.d, label: x.label, title: x.title })),
    extraPerDayNeeded: slots.length > 0 ? Math.ceil(shortfall / slots.length) : null,
    used,
  };
}

/**
 * 그날 배분에 붙는 조정 안내 — 앞선 점검일의 결과가 이 날의 시간을 바꿀 때만.
 * - D-14~D-11: D-16 추적표 정답률이 85% 미만이면 코드 80 · 주제 20 · 복습 20
 * - D-9~D-5 : D-10 점수 구간에 따라 주제 블록 일부를 가장 낮은 영역으로
 * - D-3·D-2 : D-4 점수 구간의 지침
 * @param {{d: number}} day
 * @param {{sessions?: object[], traceProgress?: Record<string,string>, gateDays: {d: number, gate: object}[]}} data
 * @returns {{text: string, measured: number|null}|null}
 */
export function adjustmentFor(day, { sessions = [], traceProgress = {}, gateDays = [] } = {}) {
  const gateDay = (d) => gateDays.find((x) => x.d === d);
  if (day.d >= 11 && day.d <= 14) {
    const ev = evaluateGate(gateDay(16), { traceProgress });
    if (!ev?.band) return { text: `D-16 판정 전 — 기본 배분대로. ${ev?.note ?? ''}`.trim(), measured: null };
    return ev.band.min === 0
      ? { text: `D-16 변수 추적표 ${ev.measured}% → 코드 80분 · 주제 20분 · 복습 20분`, measured: ev.measured }
      : { text: `D-16 변수 추적표 ${ev.measured}% → 기본 배분대로`, measured: ev.measured };
  }
  if (day.d >= 5 && day.d <= 9) {
    const ev = evaluateGate(gateDay(10), { sessions });
    if (!ev?.band) return { text: `모의고사 점수 판정 전 — 기본 배분대로. ${ev?.note ?? ''}`.trim(), measured: null };
    const shift = areaShift(shiftMinutesForD10(ev.band), areaReport(sessions));
    return { text: `모의고사 ${ev.measured}점(${ev.band.label}) → ${shift.note}`, measured: ev.measured };
  }
  if (day.d === 3 || day.d === 2) {
    const ev = evaluateGate(gateDay(4), { sessions });
    if (!ev?.band) return { text: `모의고사 점수 판정 전 — 계획대로. ${ev?.note ?? ''}`.trim(), measured: null };
    return { text: `모의고사 ${ev.measured}점(${ev.band.label}) → ${ev.band.action}`, measured: ev.measured };
  }
  return null;
}
