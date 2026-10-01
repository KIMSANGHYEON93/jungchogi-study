// 채점 결과의 도메인 규칙.
//
// quiz_results 세 값('correct'|'incorrect'|'answered')의 읽기 규칙을 화면 여러 곳이
// 같은 판정으로 쓰므로 한 곳에 모아 테스트로 못 박는다.
import { describe, it, expect } from 'vitest';
import {
  QUIZ_RESULT,
  summarizeQuizResults,
  withQuizResult,
} from '../src/domain/grading.js';

describe('withQuizResult', () => {
  it('원본을 건드리지 않고 새 맵을 만든다', () => {
    const before = { 'C-01': 'answered' };
    const after = withQuizResult(before, 'C-02', 'correct');

    expect(after).toEqual({ 'C-01': 'answered', 'C-02': 'correct' });
    expect(before).toEqual({ 'C-01': 'answered' });
  });

  it('레거시 값을 채점 결과로 덮어쓴다', () => {
    expect(withQuizResult({ 'C-01': 'answered' }, 'C-01', 'incorrect')).toEqual({
      'C-01': 'incorrect',
    });
  });

  it('계약에 없는 값은 저장하지 않는다', () => {
    const before = { 'C-01': 'answered' };
    expect(withQuizResult(before, 'C-01', 'maybe')).toEqual(before);
    expect(withQuizResult(before, 'C-01', null)).toEqual(before);
  });
});

describe('summarizeQuizResults — 레거시 answered 를 정답으로도 오답으로도 세지 않는다', () => {
  it('세 값을 각자의 칸으로 나눈다', () => {
    const s = summarizeQuizResults({
      'C-01': 'correct',
      'C-02': 'incorrect',
      'C-03': 'answered',
      'C-04': 'correct',
    });

    expect(s.attempted).toBe(4);
    expect(s.correct).toBe(2);
    expect(s.incorrect).toBe(1);
    expect(s.graded).toBe(3);
    expect(s.ungraded).toBe(1);
  });

  it('레거시만 있으면 정답률을 말하지 않는다 — 정오 정보가 없기 때문', () => {
    const s = summarizeQuizResults({ 'C-01': 'answered', 'C-02': 'answered' });

    expect(s.attempted).toBe(2);
    expect(s.correct).toBe(0);
    expect(s.incorrect).toBe(0);
    expect(s.accuracy).toBeNull();
  });

  it('정답률은 채점된 문항만으로 계산한다', () => {
    const s = summarizeQuizResults({ 'C-01': 'correct', 'C-02': 'incorrect', 'C-03': 'answered' });
    expect(s.accuracy).toBe(50);
  });

  it('문자열이 아닌 손상된 값은 시도로도 세지 않는다 (스냅샷 규칙과 같다)', () => {
    const s = summarizeQuizResults({ 'C-01': 'correct', 'C-02': 3, 'C-03': null });
    expect(s.attempted).toBe(1);
  });

  it('알 수 없는 문자열은 시도로만 세고 정오에는 넣지 않는다', () => {
    const s = summarizeQuizResults({ 'C-01': 'skipped' });
    expect(s.attempted).toBe(1);
    expect(s.graded).toBe(0);
    expect(s.ungraded).toBe(1);
  });

  it('값이 없거나 깨져 있어도 0 으로 답한다', () => {
    expect(summarizeQuizResults(null).attempted).toBe(0);
    expect(summarizeQuizResults(undefined).accuracy).toBeNull();
  });
});
