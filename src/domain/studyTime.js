// 학습 시간과 시험 시간의 **단일 정의**.
//
// 두 시간은 뜻이 다르다. 섞어 쓰면 "하루 2시간"과 "모의고사 2시간"과 "실전 2시간 30분"이 서로 어긋난다.
//  - 학습 시간: 수험자가 하루에 낼 수 있는 시간(가용 시간). 로드맵 배분의 분모다.
//  - 시험 시간: 실제 시험의 제한 시간. 모의고사 타이머가 쓴다. 학습 계획이 줄일 수 있는 값이 아니다.
// 로드맵·레슨·모의고사·학습 노트 안내는 모두 이 파일의 값을 참조한다.

/** 하루 가용 학습 시간(분) — 수험자가 실제로 낼 수 있는 시간 */
export const DAILY_MINUTES = 120;

/**
 * 보통 학습일의 하루 배분(합계 = DAILY_MINUTES). 코드 블록은 그날 주제와 무관하게 매일 돈다.
 * `required` 는 그날 꼭 해야 하는 몫(필수), 아니면 시간이 남을 때 하는 몫(추가)이다 — 여기서는 셋 다 필수다.
 */
export const DAILY_BLOCKS = Object.freeze([
  { key: 'code', label: '코드', minutes: 60, required: true, text: '코드 퀴즈 · 변수 추적표 — 주제와 무관하게 매일', to: '/quiz' },
  { key: 'topic', label: '주제', minutes: 40, required: true, text: '오늘 일차 레슨 — 확인 퀴즈 먼저, 모르는 것만 본문' },
  { key: 'review', label: '복습', minutes: 20, required: true, text: '오답노트 재풀이 · 치트시트 공식', to: '/wrong' },
]);

/** 주제 블록 길이 — 레슨 1개에 쓰는 필수 시간 */
export const TOPIC_MINUTES = DAILY_BLOCKS.find((b) => b.key === 'topic').minutes;

/**
 * 목표 자격의 실기 시험 설정.
 *
 * 시험 시간·합격 기준은 교육기관 안내(2026 출제기준 인용, eduon.com 정보처리기사 시험정보)에서 확인한 값이다:
 * 필답형 2시간 30분, 100점 만점 60점 이상 합격. 큐넷 원문 페이지는 이 저장소 작업 중 직접 열람하지 못했다 —
 * 시험 전 큐넷(q-net.or.kr) 종목 정보에서 다시 확인할 것.
 * 문항 수(20)와 문항당 배점(5점)은 공식 출제기준에 적힌 값이 아니라 이 앱의 모의고사 구성이다.
 */
export const EXAM_SPEC = Object.freeze({
  certificate: '정보처리기사',
  stage: '실기',
  format: '필답형',
  minutes: 150,
  maxScore: 100,
  passScore: 60,
  sourceNote: '시험 시간·합격 기준: 2026 출제기준을 인용한 교육기관 안내 기준(큐넷 원문 미확인 — 시험 전 큐넷에서 확인)',
});

/** 이 앱 모의고사의 구성 — 공식 문항 수가 아니라 앱이 정한 값이다 */
export const MOCK_EXAM = Object.freeze({
  questions: 20,
  pointsEach: 5,
  quizCount: 12,
  codeCount: 8,
  /** 실전 모드 제한 시간 = 실제 시험 시간 */
  minutes: EXAM_SPEC.minutes,
  /** 풀이와 따로 잡는 채점 · 오답노트 정리 시간 */
  reviewMinutes: 30,
});

/** 시간(분)을 "2시간 30분" 꼴로 */
export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
