// 25일 D-Day 로드맵 — 시험일에서 거꾸로 센 D-24 ~ D-Day 의 4단계 일정.
//
// `dailyPlan.js`(Day01~14 학습 문서를 남은 날에 균등 분배)와 달리 이쪽은 **기간별 단계**가 먼저다.
// 단계가 정해진 뒤 그 안의 하루 학습 주제가 정해진다.
//
// **정보처리기사·산업기사를 함께 준비하는 하나의 공통 계획이다.** 시험 종류별로 갈라지지 않고,
// 두 시험이 겹치는 공통 모듈(코딩·SQL·OS/네트워크·테스트)을 먼저 두고 기사 특화 주제는 그 뒤에 둔다.
//
// 이 로드맵이 앱의 **유일한 학습 계획**이다. 예전 "일일 플랜"(Day01~14 문서를 남은 날에 균등 분배)은 없앴다.
// 하루 일정이 날짜에 고정돼 있어 계획이 매일 바뀌지 않고, 밀리면 "밀린 일차"로 보여 준다.
//
// **하루 2시간 배분**(`DAILY_BLOCKS`)은 일차와 별개로 고정이다 — 코드 60 · 주제 40 · 복습 20.
// 코드가 약점인 수험자를 기준으로 짰다: 코드 블록은 그날 주제가 무엇이든 매일 돈다.
// 기출 실전일(`kind: 'practice'`)은 블록 대신 복원 기출 1회분을 2시간 안에 푼다.
// 점검일에는 `gate`(기준치와 미달 시 분기)가 붙는다 — 다음 구간의 배분을 결정하는 숫자다.
//
// 날짜는 시험일에서 d 일을 빼서 만든다. 시험일을 바꿔도 "D-n 일차"의 의미(와 체크 기록)가
// 그대로 이어지도록 체크는 날짜가 아니라 d 번호로 저장한다.

import { addDays, daysUntil, resolveExamDate } from './dailyPlan';

/** 로드맵 길이: D-24 ~ D-Day = 25칸. 체크는 D-24 ~ D-1 의 24일 학습일에만 있다. */
export const ROADMAP_START_D = 24;

/** 하루 학습 시간(분). 수험자가 실제로 낼 수 있는 시간이다 */
export const DAILY_MINUTES = 120;

/**
 * 하루 2시간의 고정 배분. 일차 주제와 무관하게 매일 같다.
 * 코드 블록이 가장 크고 맨 앞이다 — 코드 문항(6~8문제 × 5점)이 합격선을 가르는데, 하루 쉬면 감각이 떨어진다.
 */
export const DAILY_BLOCKS = Object.freeze([
  { key: 'code', label: '코드', minutes: 60, text: '코드 퀴즈 · 변수 추적표 — 주제와 무관하게 매일', to: '/quiz' },
  { key: 'topic', label: '주제', minutes: 40, text: '오늘 일차 레슨 — 퀴즈 먼저, 모르는 것만 본문' },
  { key: 'review', label: '복습', minutes: 20, text: '오답노트 재풀이 · 치트시트 공식', to: '/wrong' },
]);

/** 기출 실전일의 배분 — 세 블록 대신 한 덩어리 */
const PRACTICE_BLOCKS = Object.freeze([
  { key: 'practice', label: '기출', minutes: DAILY_MINUTES, text: '복원 기출 1회분 — 타이머 · 손으로 답안 작성 · 채점까지', to: '/exam' },
]);

export const ROADMAP_PHASES = [
  { no: 1, name: '코딩 · SQL 집중', fromD: 24, toD: 16, focus: 'C · Java · Python 코드 트레이싱과 SQL 을 먼저 굳힌다' },
  { no: 2, name: '인프라 · 테스트', fromD: 15, toD: 10, focus: 'OS · 네트워크 계산 문제와 테스트 이론' },
  { no: 3, name: '기사 특화', fromD: 9, toD: 4, focus: 'SDLC · 디자인패턴 · 연계 · 보안' },
  { no: 4, name: '기출 회독 · 최종 점검', fromD: 3, toD: 1, focus: '기출 실전 2회분과 핵심 공식 최종 점검 — 새 내용은 보지 않는다' },
];

/**
 * 하루 주제. `scope` 가 'engineer' 이면 기사 특화, 아니면 공통이다.
 * `study` 는 학습 노트 Day 번호, `query` 는 앱 안 자료를 찾는 검색어(`tests/roadmap.test.js` 가
 * 실제 자료에서 결과가 나오는지 확인한다), `to` 는 앱 안 화면 경로다.
 *
 * 3단계(D-9~D-4)는 하루마다 공통 복습 1개 + 기사 특화 1개로 짠다. 공통 복습이 항상 먼저다.
 */
const COMMON = 'common';
const ENGINEER = 'engineer';

const DAYS = [
  // ── 1단계: 코딩 · SQL ──
  { d: 24, title: 'C언어 연산자', topics: [{ text: 'C언어 — 산술 · 증감 · 비트 · 논리 연산자', scope: COMMON, study: 1, to: '/quiz' }] },
  { d: 23, title: 'C언어 제어문', topics: [{ text: 'C언어 — for · while · switch · break/continue', scope: COMMON, study: 1, to: '/quiz' }] },
  { d: 22, title: 'C언어 포인터 · 구조체', topics: [{ text: 'C언어 — 포인터 · 배열 · 문자열 · 구조체 · 재귀', scope: COMMON, study: 1, to: '/quiz' }] },
  { d: 21, title: 'Java ①', topics: [{ text: 'Java — 클래스 · 상속 · 오버라이딩', scope: COMMON, study: 2, to: '/quiz' }] },
  { d: 20, title: 'Java ②', topics: [{ text: 'Java — 예외 · static · 인터페이스 · 추상 클래스', scope: COMMON, study: 2, to: '/quiz' }] },
  { d: 19, title: 'Python', topics: [{ text: 'Python — 리스트 · 딕셔너리 · 슬라이싱 · 클래스', scope: COMMON, study: 3, to: '/quiz' }] },
  { d: 18, title: 'SQL ① 기본 · DDL', topics: [{ text: 'SQL — SELECT · WHERE · 집계 · DDL · DCL · 트리거 · 프로시저', scope: COMMON, study: 4, query: '트리거', to: '/practice?tab=sql' }] },
  { d: 17, title: 'SQL ② JOIN · 그룹 · 서브쿼리', topics: [{ text: 'SQL — JOIN · GROUP BY · HAVING · 서브쿼리', scope: COMMON, study: 3, to: '/practice?tab=sql' }] },
  {
    d: 16,
    title: '1단계 점검 — 코드 진단',
    topics: [
      { text: '변수 추적표 10문제 — C · Java · Python 섞어서, 안 보고 끝까지 쓰기', scope: COMMON, to: '/practice?tab=trace' },
      { text: '코딩 · SQL 오답노트 복습', scope: COMMON, to: '/wrong' },
    ],
    gate: {
      metric: '변수 추적표 정답률',
      pass: '85% 이상 → 계획대로 2단계',
      below: '85% 미만 → D-14~D-11 은 코드 80분 · 주제 20분으로',
    },
  },

  // ── 2단계: 인프라 · 테스트 ──
  { d: 15, title: '프로세스 스케줄링', topics: [{ text: 'OS — 스케줄링 계산 (FCFS · SJF · HRN · RR)', scope: COMMON, study: 6, query: '스케줄링' }] },
  { d: 14, title: '메모리 · 교착상태', topics: [{ text: 'OS — 페이지 교체 (FIFO · LRU · LFU) · 교착상태', scope: COMMON, study: 6, query: '페이지 교체' }] },
  { d: 13, title: '네트워크 ① 주소 계산', topics: [{ text: '네트워크 — IP 주소 · 서브넷 마스크 · CIDR 계산', scope: COMMON, study: 6, query: '서브넷' }] },
  { d: 12, title: '네트워크 ② 프로토콜', topics: [{ text: '네트워크 — OSI · TCP/UDP · 주요 프로토콜', scope: COMMON, study: 6 }] },
  { d: 11, title: '애플리케이션 테스트', topics: [{ text: '테스트 — 블랙박스 · 화이트박스 · 순환 복잡도 · 테스트 레벨', scope: COMMON, study: 6, query: '블랙박스' }] },
  {
    d: 10,
    title: '2단계 점검 — 기출 ①',
    kind: 'practice',
    topics: [
      { text: '복원 기출 1회분 실전 — 2시간 타이머, 손으로 답안 작성', scope: COMMON, to: '/exam' },
      { text: '채점 후 계산 문제(치트시트)와 틀린 코드만 오답노트에', scope: COMMON, to: '/wrong' },
    ],
    gate: {
      metric: '기출 ① 점수',
      pass: '50점 이상 → 계획대로 3단계',
      below: '40점 미만 → 3단계 주제 블록을 코드로 돌림',
    },
  },

  // ── 3단계: 기사 특화 (공통 복습 + 기사 특화) ──
  {
    d: 9,
    title: 'SDLC',
    topics: [
      { text: '공통 복습 — 코드 트레이싱 3문제', scope: COMMON, to: '/quiz' },
      { text: 'SDLC — 개발 방법론 (폭포수 · 애자일) · 요구사항 · UML', scope: ENGINEER, study: 5, query: '요구사항' },
    ],
  },
  {
    d: 8,
    title: '디자인패턴 ①',
    topics: [
      { text: '공통 복습 — SQL 쿼리 3문제', scope: COMMON, to: '/practice?tab=sql' },
      { text: '디자인패턴 — 생성 · 구조 패턴', scope: ENGINEER, study: 5 },
    ],
  },
  {
    d: 7,
    title: '디자인패턴 ②',
    topics: [
      { text: '공통 복습 — OS · 네트워크 계산 3문제', scope: COMMON, study: 6 },
      { text: '디자인패턴 — 행위 패턴 · 결합도 · 응집도', scope: ENGINEER, study: 5 },
    ],
  },
  {
    d: 6,
    title: '연계 · 인터페이스',
    topics: [
      { text: '공통 복습 — 테스트 · 정규화', scope: COMMON, study: 6 },
      { text: '통합 구현 — 연계 (EAI · ESB) · 인터페이스', scope: ENGINEER, query: 'EAI' },
    ],
  },
  {
    d: 5,
    title: '보안',
    topics: [
      { text: '공통 복습 — 오답노트', scope: COMMON, to: '/wrong' },
      { text: '보안 — SW 개발 보안 · 암호화', scope: ENGINEER, study: 6, query: '암호화' },
    ],
  },
  {
    d: 4,
    title: '3단계 점검 — 기출 ②',
    kind: 'practice',
    topics: [
      { text: '복원 기출 1회분 실전 — 2시간 타이머, 손으로 답안 작성', scope: COMMON, to: '/exam' },
      { text: '기사 특화 총정리 — 이론 용어 암기 (채점 후 남는 시간만)', scope: ENGINEER, study: 8 },
    ],
    gate: {
      metric: '기출 ② 점수',
      pass: '60점 이상 → D-3 부터 이론 범위를 넓혀도 됨',
      below: '60점 미만 → D-3 · D-2 는 틀린 유형만 반복',
    },
  },

  // ── 4단계: 기출 회독 · 최종 점검 ──
  { d: 3, title: '기출 ③', kind: 'practice', topics: [{ text: '기출 1회분 실전 — 코딩 · SQL 부터, 틀린 유형은 바로 오답노트', scope: COMMON, study: 9, to: '/exam' }] },
  { d: 2, title: '기출 ④ · 약점', kind: 'practice', topics: [{ text: '기출 1회분 실전 + 기출 ①~③ 에서 틀린 유형만 반복', scope: COMMON, study: 11, to: '/exam' }] },
  { d: 1, title: '핵심 공식 최종 점검', topics: [{ text: '오답노트 재풀이 30분 · 핵심 공식(서브넷 · 순환 복잡도 · HRN · 페이지 교체) · 컨디션 관리 — 새 내용 금지', scope: COMMON, study: 13, to: '/wrong' }] },
];

/** D-Day 당일 — 체크 대상이 아니다 */
const EXAM_DAY = {
  d: 0,
  title: '시험 당일',
  topics: [{ text: '신분증 · 수험표 · 필기구 확인, 암기 노트 가볍게 훑기', scope: COMMON, study: 14 }],
};

/**
 * 하루 주제를 공통 → 기사 특화 순으로 정렬한다. 안정 정렬이라 같은 scope 끼리는 원래 순서를 지킨다.
 * 기사·산업기사를 함께 준비하므로 거르지는 않는다.
 */
export function topicsFor(day) {
  const rank = (t) => (t.scope === COMMON ? 0 : 1);
  return [...day.topics].sort((a, b) => rank(a) - rank(b));
}

export function phaseOfD(d) {
  return ROADMAP_PHASES.find((p) => d <= p.fromD && d >= p.toD) ?? null;
}

/**
 * @typedef {Object} RoadmapDay
 * @property {number} d 시험까지 남은 일수(D-n)
 * @property {string} label 'D-24' · 'D-Day'
 * @property {string} date YYYY-MM-DD
 * @property {number|null} phaseNo
 * @property {string} title
 * @property {typeof DAYS[number]['topics']} topics
 * @property {boolean} done
 * @property {boolean} isToday
 * @property {boolean} isPast
 * @property {boolean} busy 캘린더에서 가져온 "일정이 많은 날"인지 (학습일만)
 * @property {'study'|'practice'|'exam'} kind 보통 학습일 · 기출 실전일 · 시험 당일
 * @property {{metric: string, pass: string, below: string}|null} gate 점검일의 기준치와 분기
 */

/**
 * @param {{examDate?: unknown, today: string, checks?: Record<string, unknown>, busyDates?: Iterable<string>}} input
 *   `busyDates` 는 표시용이다 — 일정이 많은 날에도 일차는 옮기지 않고 "가볍게" 표시만 한다.
 * @returns {{
 *   status: 'ok'|'before'|'exam-passed'|'no-date',
 *   examDate: string|null, isDefaultExamDate: boolean,
 *   todayD: number|null, phases: (typeof ROADMAP_PHASES[number] & {days: RoadmapDay[]})[],
 *   examDay: RoadmapDay|null, today: RoadmapDay|null, late: number[],
 *   progress: {done: number, total: number, percent: number}
 * }}
 */
export function buildRoadmap({ examDate: storedExamDate, today, checks = {}, busyDates = [] }) {
  const { examDate, isDefault } = resolveExamDate(storedExamDate, today);
  const empty = (status) => ({
    status,
    examDate,
    isDefaultExamDate: isDefault,
    todayD: null,
    phases: [],
    examDay: null,
    today: null,
    late: [],
    progress: { done: 0, total: DAYS.length, percent: 0 },
  });
  if (examDate === null) return empty('no-date');

  const todayD = daysUntil(examDate, today);
  const busy = new Set(busyDates);
  const toDay = (day) => {
    const date = addDays(examDate, -day.d);
    return {
      d: day.d,
      label: day.d === 0 ? 'D-Day' : `D-${day.d}`,
      date,
      phaseNo: phaseOfD(day.d)?.no ?? null,
      title: day.title,
      topics: topicsFor(day),
      done: day.d > 0 && !!checks?.[day.d],
      isToday: todayD === day.d,
      isPast: todayD !== null && todayD < day.d,
      busy: day.d > 0 && busy.has(date),
      kind: day.d === 0 ? 'exam' : day.kind ?? 'study',
      gate: day.gate ?? null,
    };
  };

  const days = DAYS.map(toDay);
  const examDay = toDay(EXAM_DAY);
  const done = days.filter((x) => x.done).length;
  const base = {
    status: todayD < 0 ? 'exam-passed' : todayD > ROADMAP_START_D ? 'before' : 'ok',
    examDate,
    isDefaultExamDate: isDefault,
    todayD,
    phases: ROADMAP_PHASES.map((p) => ({ ...p, days: days.filter((x) => x.phaseNo === p.no) })),
    examDay,
    // 오늘에 해당하는 일차(D-24 ~ D-Day). 시작 전·시험 후면 null
    today: todayD !== null && todayD >= 0 && todayD <= ROADMAP_START_D ? [...days, examDay].find((x) => x.d === todayD) ?? null : null,
    // 지났는데 끝내지 못한 일차 — 큰 D 번호(오래된 날)부터
    late: days.filter((x) => x.isPast && !x.done).map((x) => x.d),
    progress: { done, total: DAYS.length, percent: Math.round((done / DAYS.length) * 100) },
  };
  return base;
}

/**
 * 오늘 다음 일차들(최대 count 개, D-Day 포함). 로드맵 시작 전이면 첫 일차부터, 시험 후면 빈 배열.
 * @param {ReturnType<typeof buildRoadmap>} roadmap
 * @param {number} count
 * @returns {RoadmapDay[]}
 */
export function upcomingDays(roadmap, count) {
  if (roadmap.status !== 'ok' && roadmap.status !== 'before') return [];
  const all = [...roadmap.phases.flatMap((p) => p.days), ...(roadmap.examDay ? [roadmap.examDay] : [])];
  const from = roadmap.status === 'before' ? ROADMAP_START_D + 1 : roadmap.todayD;
  return all.filter((x) => x.d < from).slice(0, Math.max(0, count));
}

/**
 * 학습 노트 Day N 문서를 다루는 로드맵 일차들 (D 번호 큰 순 = 일정 순).
 * @param {ReturnType<typeof buildRoadmap>} roadmap
 * @param {number} study 학습 노트 Day 번호
 * @returns {RoadmapDay[]}
 */
export function daysForStudyDoc(roadmap, study) {
  return roadmap.phases.flatMap((p) => p.days).filter((x) => x.topics.some((t) => t.study === study));
}

/**
 * 캘린더 내보내기용 일정: 오늘부터의 학습일(완료한 날은 뺀다)과 시험 당일.
 * `utils/icsExport.buildIcs` 가 받는 모양이다 — 하루마다 이벤트 하나, `title` 이 이벤트 제목이다.
 * @param {ReturnType<typeof buildRoadmap>} roadmap
 * @returns {{date: string, dDay: number, kind: 'study'|'exam', title?: string, units: {label: string, phase: {label: string}}[], busy: boolean}[]}
 */
export function roadmapSchedule(roadmap) {
  if (roadmap.status !== 'ok' && roadmap.status !== 'before') return [];
  const phaseName = new Map(ROADMAP_PHASES.map((p) => [p.no, p.name]));
  const fromD = roadmap.status === 'before' ? ROADMAP_START_D : roadmap.todayD;
  const days = [...roadmap.phases.flatMap((p) => p.days), ...(roadmap.examDay ? [roadmap.examDay] : [])];
  return days
    .filter((x) => x.d <= fromD && (x.d === 0 || !x.done))
    .map((x) => ({
      date: x.date,
      dDay: x.d,
      kind: x.d === 0 ? 'exam' : 'study',
      title: x.d === 0 ? undefined : `${x.label} ${x.title}`,
      units: x.topics.map((t) => ({ label: t.text, phase: { label: phaseName.get(x.phaseNo) ?? '' } })),
      busy: x.busy,
    }));
}

/**
 * 그날의 2시간 배분. 보통 학습일은 고정 블록, 기출 실전일은 기출 한 덩어리, 시험 당일은 없음.
 * @param {{kind?: string, d: number}} day
 * @returns {{key: string, label: string, minutes: number, text: string, to?: string}[]}
 */
export function dayBlocks(day) {
  if (day.d === 0 || day.kind === 'exam') return [];
  return day.kind === 'practice' ? PRACTICE_BLOCKS : DAILY_BLOCKS;
}

/** 테스트와 화면이 같은 원본을 본다 */
export const ROADMAP_DAYS = DAYS;

const ROUTE_LABEL = { '/quiz': '코드 퀴즈', '/practice': '실기 연습', '/wrong': '오답노트', '/exam': '모의고사' };

/**
 * 주제에서 갈 수 있는 화면 링크들. 학습 노트 → 검색 → 연습 화면 순이다.
 * @param {typeof DAYS[number]['topics'][number]} topic
 * @returns {{to: string, label: string}[]}
 */
export function topicLinks(topic) {
  const links = [];
  if (topic.study !== undefined) links.push({ to: `/study?day=${topic.study}`, label: `학습 노트 Day ${topic.study}` });
  if (topic.query) links.push({ to: `/search?q=${encodeURIComponent(topic.query)}`, label: `자료 검색 · ${topic.query}` });
  if (topic.to) links.push({ to: topic.to, label: ROUTE_LABEL[topic.to.split('?')[0]] ?? topic.to });
  return links;
}
