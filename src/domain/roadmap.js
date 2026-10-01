// 25일 D-Day 로드맵 — 시험일에서 거꾸로 센 D-24 ~ D-Day 의 4단계 일정.
//
// `dailyPlan.js`(Day01~14 학습 문서를 남은 날에 균등 분배)와 달리 이쪽은 **기간별 단계**가 먼저다.
// 단계가 정해진 뒤 그 안의 하루 학습 주제가 정해진다.
//
// **정보처리기사·산업기사를 함께 준비하는 하나의 공통 계획이다.** 시험 종류별로 갈라지지 않고,
// 두 시험이 겹치는 공통 모듈(코딩·SQL·OS/네트워크·테스트)을 먼저 두고 기사 특화 주제는 그 뒤에 둔다.
//
// 날짜는 시험일에서 d 일을 빼서 만든다. 시험일을 바꿔도 "D-n 일차"의 의미(와 체크 기록)가
// 그대로 이어지도록 체크는 날짜가 아니라 d 번호로 저장한다.

import { addDays, daysUntil, resolveExamDate } from './dailyPlan';

/** 로드맵 길이: D-24 ~ D-Day = 25칸. 체크는 D-24 ~ D-1 의 24일 학습일에만 있다. */
export const ROADMAP_START_D = 24;

export const ROADMAP_PHASES = [
  { no: 1, name: '코딩 · SQL 집중', fromD: 24, toD: 16, focus: 'C · Java · Python 코드 트레이싱과 SQL 을 먼저 굳힌다' },
  { no: 2, name: '인프라 · 테스트', fromD: 15, toD: 10, focus: 'OS · 네트워크 계산 문제와 테스트 이론' },
  { no: 3, name: '기사 특화', fromD: 9, toD: 4, focus: 'SDLC · 디자인패턴 · 연계 · 보안' },
  { no: 4, name: '기출 회독 · 최종 점검', fromD: 3, toD: 1, focus: '최신 기출 회독과 핵심 공식 최종 점검' },
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
  { d: 24, title: 'C언어 ①', topics: [{ text: 'C언어 — 포인터 · 배열 · 문자열', scope: COMMON, study: 1, to: '/quiz' }] },
  { d: 23, title: 'C언어 ②', topics: [{ text: 'C언어 — 구조체 · 재귀 · 비트 연산', scope: COMMON, study: 1, to: '/quiz' }] },
  { d: 22, title: 'Java ①', topics: [{ text: 'Java — 클래스 · 상속 · 오버라이딩', scope: COMMON, study: 2, to: '/quiz' }] },
  { d: 21, title: 'Java ②', topics: [{ text: 'Java — 예외 · static · 인터페이스 · 추상 클래스', scope: COMMON, study: 2, to: '/quiz' }] },
  { d: 20, title: 'Python', topics: [{ text: 'Python — 리스트 · 딕셔너리 · 슬라이싱 · 클래스', scope: COMMON, study: 3, to: '/quiz' }] },
  { d: 19, title: 'SQL ①', topics: [{ text: 'SQL — SELECT · JOIN · GROUP BY · HAVING', scope: COMMON, study: 3, to: '/practice?tab=sql' }] },
  { d: 18, title: 'SQL ②', topics: [{ text: 'SQL — 서브쿼리 · DDL · DCL · 트리거 · 프로시저', scope: COMMON, study: 4, query: '트리거' }] },
  { d: 17, title: '코드 트레이싱 종합', topics: [{ text: '변수 추적표로 C · Java · Python 섞어 풀기', scope: COMMON, to: '/practice?tab=trace' }] },
  { d: 16, title: '1단계 점검', topics: [{ text: '코딩 · SQL 오답노트 복습', scope: COMMON, to: '/wrong' }] },

  // ── 2단계: 인프라 · 테스트 ──
  { d: 15, title: '프로세스 스케줄링', topics: [{ text: 'OS — 스케줄링 계산 (FCFS · SJF · HRN · RR)', scope: COMMON, study: 6, query: '스케줄링' }] },
  { d: 14, title: '메모리 · 교착상태', topics: [{ text: 'OS — 페이지 교체 (FIFO · LRU · LFU) · 교착상태', scope: COMMON, study: 6, query: '페이지 교체' }] },
  { d: 13, title: '네트워크 ① 주소 계산', topics: [{ text: '네트워크 — IP 주소 · 서브넷 마스크 · CIDR 계산', scope: COMMON, study: 6, query: '서브넷' }] },
  { d: 12, title: '네트워크 ② 프로토콜', topics: [{ text: '네트워크 — OSI · TCP/UDP · 주요 프로토콜', scope: COMMON, study: 6 }] },
  { d: 11, title: '애플리케이션 테스트', topics: [{ text: '테스트 — 블랙박스 · 화이트박스 · 순환 복잡도 · 테스트 레벨', scope: COMMON, study: 6, query: '블랙박스' }] },
  { d: 10, title: '2단계 점검', topics: [{ text: '계산 문제 반복 (치트시트) + 오답노트 복습', scope: COMMON, to: '/wrong' }] },

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
    title: '3단계 점검',
    topics: [
      { text: '공통 복습 — 전 영역 오답 총점검', scope: COMMON, to: '/wrong' },
      { text: '기사 특화 총정리 — 이론 용어 암기', scope: ENGINEER, study: 8 },
    ],
  },

  // ── 4단계: 기출 회독 · 최종 점검 ──
  { d: 3, title: '기출 회독 ①', topics: [{ text: '최신 기출 회독 1회 — 코딩 · SQL 부터', scope: COMMON, study: 9, to: '/exam' }] },
  { d: 2, title: '기출 회독 ② · 약점', topics: [{ text: '최신 기출 회독 2회 + 약점 보강', scope: COMMON, study: 11, to: '/exam' }] },
  { d: 1, title: '핵심 공식 최종 점검', topics: [{ text: '핵심 공식(서브넷 · 순환 복잡도 · HRN · 페이지 교체) 최종 점검 + 컨디션 관리', scope: COMMON, study: 13 }] },
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
 */

/**
 * @param {{examDate?: unknown, today: string, checks?: Record<string, unknown>}} input
 * @returns {{
 *   status: 'ok'|'before'|'exam-passed'|'no-date',
 *   examDate: string|null, isDefaultExamDate: boolean,
 *   todayD: number|null, phases: (typeof ROADMAP_PHASES[number] & {days: RoadmapDay[]})[],
 *   examDay: RoadmapDay|null, progress: {done: number, total: number, percent: number}
 * }}
 */
export function buildRoadmap({ examDate: storedExamDate, today, checks = {} }) {
  const { examDate, isDefault } = resolveExamDate(storedExamDate, today);
  const empty = (status) => ({
    status,
    examDate,
    isDefaultExamDate: isDefault,
    todayD: null,
    phases: [],
    examDay: null,
    progress: { done: 0, total: DAYS.length, percent: 0 },
  });
  if (examDate === null) return empty('no-date');

  const todayD = daysUntil(examDate, today);
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
    };
  };

  const days = DAYS.map(toDay);
  const done = days.filter((x) => x.done).length;
  const base = {
    status: todayD < 0 ? 'exam-passed' : todayD > ROADMAP_START_D ? 'before' : 'ok',
    examDate,
    isDefaultExamDate: isDefault,
    todayD,
    phases: ROADMAP_PHASES.map((p) => ({ ...p, days: days.filter((x) => x.phaseNo === p.no) })),
    examDay: toDay(EXAM_DAY),
    progress: { done, total: DAYS.length, percent: Math.round((done / DAYS.length) * 100) },
  };
  return base;
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
