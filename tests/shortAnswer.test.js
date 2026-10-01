import { describe, it, expect } from 'vitest';
import { gradeAnswer, normalizeAnswer, SHORT_ANSWER_ITEMS } from '../src/domain/shortAnswer.js';

const hits = (r) => r.segments.filter((s) => s.hit).map((s) => s.text);

describe('normalizeAnswer', () => {
  it('소문자화하고 공백·구두점을 모두 제거한다', () => {
    expect(normalizeAnswer(' Hold & Wait.\n(점유/대기)-_;:,· ')).toBe('hold&wait점유대기');
  });
  it('문자열이 아니면 빈 문자열', () => {
    expect(normalizeAnswer(null)).toBe('');
    expect(normalizeAnswer(undefined)).toBe('');
    expect(normalizeAnswer(42)).toBe('');
  });
});

describe('gradeAnswer', () => {
  const kws = [{ label: '원자성', aliases: ['atomicity'] }, { label: '일관성' }, { label: '격리성', aliases: ['독립성'] }];

  it('label 이나 alias 가 정규화된 답안에 있으면 매칭한다 (부분 문자열)', () => {
    const r = gradeAnswer('원자성이 보장되고, Atomicity! 독립성도 있다', kws);
    expect(r.matched.map((k) => k.label)).toEqual(['원자성', '격리성']);
    expect(r.missed.map((k) => k.label)).toEqual(['일관성']);
    expect(r.ratio).toBeCloseTo(2 / 3);
  });

  it('공백이 낀 원문에서도 하이라이트 위치가 원문 글자에 맞는다', () => {
    const r = gradeAnswer('TCP 는 연결  지향형 이다', [{ label: '연결 지향' }]);
    expect(r.matched).toHaveLength(1);
    expect(hits(r)).toEqual(['연결  지향']);
    expect(r.segments.map((s) => s.text).join('')).toBe('TCP 는 연결  지향형 이다');
  });

  it('겹치는 구간은 하나로 병합한다', () => {
    const r = gradeAnswer('상호 배제와 배제', [{ label: '상호 배제' }, { label: '호배제와' }]);
    expect(hits(r)).toEqual(['상호 배제와']);
  });

  it('같은 키워드가 여러 번 나오면 모두 하이라이트한다', () => {
    const r = gradeAnswer('격리성, 그리고 격리성', [{ label: '격리성' }]);
    expect(hits(r)).toEqual(['격리성', '격리성']);
  });

  it('segments 를 이어 붙이면 항상 원문과 같다', () => {
    const text = '  앞 원자성 중간 Atomicity 끝  ';
    const r = gradeAnswer(text, kws);
    expect(r.segments.map((s) => s.text).join('')).toBe(text);
  });

  it('빈 답안·빈 키워드·null 에 던지지 않는다', () => {
    expect(gradeAnswer('', kws)).toMatchObject({ matched: [], ratio: 0, segments: [] });
    expect(gradeAnswer('답', [])).toMatchObject({ matched: [], missed: [], ratio: 0 });
    expect(gradeAnswer(null, null)).toMatchObject({ matched: [], missed: [], ratio: 0, segments: [] });
    expect(gradeAnswer('답', [null, { label: '' }, {}])).toMatchObject({ matched: [], ratio: 0 });
  });

  it('이모지 같은 서로게이트 문자가 섞여도 구간이 깨지지 않는다', () => {
    const r = gradeAnswer('😀 원자성 😀', [{ label: '원자성' }]);
    expect(hits(r)).toEqual(['원자성']);
    expect(r.segments.map((s) => s.text).join('')).toBe('😀 원자성 😀');
  });
});

describe('SHORT_ANSWER_ITEMS', () => {
  it('최소 10문항이고 id 가 유일하다', () => {
    expect(SHORT_ANSWER_ITEMS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SHORT_ANSWER_ITEMS.map((i) => i.id)).size).toBe(SHORT_ANSWER_ITEMS.length);
  });

  it.each(SHORT_ANSWER_ITEMS.map((i) => [i.id, i]))('%s: 모범 답안이 자기 키워드를 전부 만족한다', (_id, item) => {
    expect(item.topic && item.question && item.model).toBeTruthy();
    expect(item.keywords.length).toBeGreaterThan(0);
    const r = gradeAnswer(item.model, item.keywords);
    expect(r.missed.map((k) => k.label)).toEqual([]);
    expect(r.ratio).toBe(1);
  });

  it('동의어를 aliases 로 받는다 (영속성↔지속성, 환형 대기↔순환 대기)', () => {
    const acid = SHORT_ANSWER_ITEMS.find((i) => i.id === 'sa-acid');
    expect(gradeAnswer('원자성 일관성 독립성 지속성', acid.keywords).ratio).toBe(1);
    const dl = SHORT_ANSWER_ITEMS.find((i) => i.id === 'sa-deadlock');
    expect(gradeAnswer('상호배제 점유와 대기 비선점 순환 대기', dl.keywords).ratio).toBe(1);
  });
});
